// ============================================================================
// order-search-core.js
// ----------------------------------------------------------------------------
// search.html에서 "주문을 실제로 가져오고 지우는" 데이터 계층만 따로 뺀 파일입니다.
// 화면에 카드를 그리는 renderResults()는 후기 작성/재구입 버튼 같은 다른 기능들과
// 상태를 공유하고 있어서(reviewItemRegistry 등) search.html에 그대로 남겨뒀고,
// 여기는 Firestore를 직접 다루는 순수 로직만 있어서 이 파일만 열어서 고치면 됩니다.
//
// 사용법 (search.html 쪽):
//   import { ORDER_COLLAPSE_DAYS, safeDate, wrapCollapsible,
//            createFetchDocsByName, createDeleteHandlers } from './order-search-core.js';
//   const fetchDocsByName = createFetchDocsByName(db, cartDb);
//   const { deleteOrder, deleteCartOrder } = createDeleteHandlers(db, cartDb, () => { ...검색 새로고침... });
//
// [주의] 이 파일을 import하려면 search.html이 실제 웹서버(GitHub Pages 등)로
// 서비스되고 있어야 합니다. 컴퓨터에서 파일을 그냥 더블클릭해서(file://) 열면
// 브라우저 보안 정책 때문에 모듈 import가 막혀서 안 열릴 수 있습니다.
// ============================================================================

import {
    collection, query, where, getDocs, doc, deleteDoc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// 접수 이후 이 기간(일)이 지난 주문은 검색 결과에서 기본적으로 접어둠
export const ORDER_COLLAPSE_DAYS = 7;

// 날짜 필드가 없거나(undefined) 형식이 이상해도 절대 예외를 던지지 않는 안전한 Date 파서.
// Firestore Timestamp(.toDate 있음)와 문자열/숫자 둘 다 처리하고, 실패하면 1970년으로 대체함
// (화면에 이상한 값이 보일 순 있어도 카드 전체가 죽지는 않게 하기 위함).
export function safeDate(v) {
    try {
        const d = v?.toDate ? v.toDate() : new Date(v);
        return isNaN(d.getTime()) ? new Date(0) : d;
    } catch (e) {
        return new Date(0);
    }
}

// 오래된(ORDER_COLLAPSE_DAYS 이전) 주문 카드를 클릭해서 펼쳐볼 수 있는 요약 형태로 감싸줌
export function wrapCollapsible(fullHtml, isRecent, cardId, summaryLabel) {
    if (isRecent) return fullHtml; // 최근 주문은 그대로 펼쳐진 채로 둠
    return `
    <div class="mb-4">
        <button type="button" onclick="toggleOrderCard('${cardId}')"
            class="w-full text-left bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-600 flex justify-between items-center gap-2">
            <span class="truncate">${summaryLabel}</span>
            <span id="${cardId}_arrow" class="shrink-0 text-blue-600 font-semibold">▾ 펼쳐보기</span>
        </button>
        <div id="${cardId}" style="display:none;">${fullHtml}</div>
    </div>`;
}

// 이름으로 boards/jjjj/cart(orders) 3개 컬렉션을 모두 조회해서 공통 형태로 합쳐줌
// (전화번호 조회, 구글 자동 연결 양쪽에서 재사용)
// Promise.allSettled를 써서 셋 중 하나(예: board 프로젝트)가 실패해도 나머지 정상인
// 컬렉션 결과는 그대로 반환함 — 하나가 죽는다고 전체가 죽지 않게 함.
export function createFetchDocsByName(db, cartDb) {
    return async function fetchDocsByName(name) {
        const qBoards = query(collection(db, "boards"), where("author", "==", name));
        const qJjjj = query(collection(db, "jjjj"), where("author", "==", name));
        const qCart = query(collection(cartDb, "orders"), where("name", "==", name));

        const [resBoards, resJjjj, resCart] = await Promise.allSettled([getDocs(qBoards), getDocs(qJjjj), getDocs(qCart)]);

        [
            ['boards', resBoards], ['jjjj', resJjjj], ['cart orders', resCart]
        ].forEach(([label, res]) => {
            if (res.status === 'rejected') console.error(`"${label}" 컬렉션 조회 실패(다른 컬렉션 결과는 정상 반환됨):`, res.reason);
        });

        const snapBoards = resBoards.status === 'fulfilled' ? resBoards.value : { docs: [] };
        const snapJjjj = resJjjj.status === 'fulfilled' ? resJjjj.value : { docs: [] };
        const snapCart = resCart.status === 'fulfilled' ? resCart.value : { docs: [] };

        return [
            ...snapBoards.docs.map(d => ({ ...d.data(), id: d.id, isJajoo: false, source: 'board' })),
            ...snapJjjj.docs.map(d => ({ ...d.data(), id: d.id, isJajoo: true, source: 'board' })),
            // cart.html의 orders 컬렉션은 필드 구조가 완전히 달라서(author 대신 name,
            // 단일 상품 대신 items 배열) 렌더링에서 쓸 공통 필드만 맞춰서 정규화함.
            ...snapCart.docs.map(d => {
                const data = d.data();
                return {
                    ...data,
                    id: d.id,
                    isJajoo: false,
                    source: 'cart',
                    author: data.name,
                    phone: data.phone
                };
            })
        ];
    };
}

// 주문 삭제 — 게시판형(boards/jjjj)과 장바구니형(cartDb orders)을 각각 처리.
// onAfterDelete: 삭제 성공 후 화면을 새로고침할 콜백(구글조회/이름조회 상태에 맞게 search.html에서 넘겨줌)
export function createDeleteHandlers(db, cartDb, onAfterDelete) {
    async function deleteOrder(docId, isJajoo) {
        if (!confirm("정말로 이 주문을 삭제하시겠습니까? 삭제된 데이터는 복구할 수 없습니다.")) return;
        try {
            const collectionName = isJajoo ? "jjjj" : "boards";
            await deleteDoc(doc(db, collectionName, docId));
            alert("삭제되었습니다.");
            onAfterDelete && onAfterDelete();
        } catch (error) {
            console.error("삭제 실패:", error);
            alert("삭제 중 오류가 발생했습니다.");
        }
    }

    async function deleteCartOrder(docId) {
        if (!confirm("정말로 이 주문을 삭제하시겠습니까? 삭제된 데이터는 복구할 수 없습니다.")) return;
        try {
            await deleteDoc(doc(cartDb, "orders", docId));
            alert("삭제되었습니다.");
            onAfterDelete && onAfterDelete();
        } catch (error) {
            console.error("삭제 실패:", error);
            alert("삭제 중 오류가 발생했습니다.");
        }
    }

    return { deleteOrder, deleteCartOrder };
}
