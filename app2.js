import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, getDocs, doc, getDoc, query, orderBy, addDoc, limit, deleteDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyDU8d6Sh-TDNnRd2aA",
    authDomain: "board-291e3.firebaseapp.com",
    projectId: "board-291e3",
    storageBucket: "board-291e3.firebasestorage.app",
    messagingSenderId: "25881766316",
    appId: "1:25881766316:web:c03e118cf26d3fff11b209"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

let allOrders = [];
let currentPage = 1;
let currentViewId = ""; 
const POSTS_PER_PAGE = 8;

// [메모 관련 함수]
async function loadMemo(boardId, finalCode = "") {
    const memoDisplay = document.getElementById("memo-display");
    const memoStatus = document.getElementById("memo-status");
    const memoImgCode = document.getElementById("memo-img-code");
    
    if (!memoDisplay || !memoStatus) return;
    
    const q = query(collection(db, "boards", boardId, "hanjool"), orderBy("createdAt", "desc"), limit(1));
    const snapshot = await getDocs(q);

    if (!snapshot.empty) {
        memoDisplay.innerText = snapshot.docs[0].data().text;
        memoStatus.classList.remove("hidden");
        if (finalCode) memoImgCode.innerText = `(${finalCode.substring(0, 6)})`;
    } else {
        memoDisplay.innerText = "작성된 메모가 없습니다.";
        memoStatus.classList.add("hidden");
    }
}

// [시안 상세 보기]
window.viewDetail = async function(id) {
    const snap = await getDoc(doc(db, "boards", id));
    if (!snap.exists()) return alert("게시글이 존재하지 않습니다.");
    
    const data = snap.data();
    const storedPass = String(data.password || "");

    // [이미지 코드 계산 로직을 함수 상단으로 통합]
    const createdAt = data.createdAt ? data.createdAt.toDate() : new Date();
    const yy = String(createdAt.getFullYear()).slice(-2);
    const mm = String(createdAt.getMonth() + 1).padStart(2, '0');
    const dd = String(createdAt.getDate()).padStart(2, '0');
    const hh = String(createdAt.getHours()).padStart(2, '0');
    const mi = String(createdAt.getMinutes()).padStart(2, '0');
    const timeCode = `${yy}${mm}${dd}${hh}${mi}`;
    const rawPhone = data.phone || "00000000000";
    const phonePrefix = rawPhone.slice(0, -2);
    const finalCode = phonePrefix + timeCode;

    const modal = document.getElementById("password-modal");
    const input = document.getElementById("modal-password-input");
    const confirmBtn = document.getElementById("modal-confirm-btn");
    const cancelBtn = document.getElementById("modal-cancel-btn");

    modal.classList.remove("hidden");
    input.value = "";
    input.focus();

    confirmBtn.onclick = () => {
        const inputVal = input.value;
        const isNumeric = /^\d+$/.test(storedPass);
        const passToCompare = isNumeric ? storedPass.slice(-4) : storedPass;

        if (inputVal === passToCompare) {
            modal.classList.add("hidden");
            currentViewId = id;
            
            loadMemo(id, finalCode); // 메모 로드 시 코드 전달
            
            const dTitle = document.getElementById("detail-title");
            const dImage = document.getElementById("detail-image");
            const vList = document.getElementById("view-list");
            const vDetail = document.getElementById("view-detail");

            if (dTitle) dTitle.innerText = `${data.author}님 (${data.productName}/${data.quantity}/${data.size})`;
            if (dImage) {
                const imgUrl = `https://sowonnamoo1005.cafe24.com/1/${finalCode}.jpg`;
                const timestamp = new Date().getTime();

                dImage.innerHTML = `
                <div id="image-container" style="position: relative; width: 744px; min-height: 500px; margin: 0; border: none; background-color: #f9f9f9; display: flex; align-items: center; justify-content: center;">
                    <img id="loading-msg" src="https://sowonnamoo1005.cafe24.com/web/1new/preview_v1.jpg" alt="제작중" style="max-width: 100%; max-height: 100%; display: none; position: absolute;">
                    <a href="water.html?url=${encodeURIComponent(imgUrl + '?t=' + timestamp)}" target="_blank" style="display: grid; width: 100%; height: 100%; text-decoration: none; position: relative;">
                        <img src="${imgUrl}?t=${timestamp}" alt="시안 이미지" 
                             onerror="this.style.display='none'; document.getElementById('loading-msg').style.display='block';"
                             onload="document.getElementById('loading-msg').style.display='none';"
                             style="grid-area: 1 / 1; width: 100%; height: 100%; object-fit: contain; cursor: pointer; display: block; z-index: 1;">
                    </a>
                </div>
                <div id="image-code" style="text-align: left; margin-top: 5px; font-size: 9pt; font-weight: bold; color: black; padding-left: 5px;">
                    재구입 이미지번호 : ${finalCode}
                </div>`;
            }
            if (vList) vList.classList.add("hidden");
            if (vDetail) vDetail.classList.remove("hidden");
        } else {
            alert("비밀번호가 일치하지 않습니다.");
        }
    };
    cancelBtn.onclick = () => modal.classList.add("hidden");
};

// [기타 이벤트: 메모 저장/삭제/검색...]
document.getElementById("save-memo-btn").addEventListener("click", async () => {
    if (!currentViewId) return;
    const input = document.getElementById("memo-input");
    if (!input.value.trim()) return;

    const q = query(collection(db, "boards", currentViewId, "hanjool"));
    const snapshot = await getDocs(q);
    await Promise.all(snapshot.docs.map(doc => deleteDoc(doc.ref)));

    await addDoc(collection(db, "boards", currentViewId, "hanjool"), { text: input.value, createdAt: new Date() });
    input.value = "";
    
    // 화면상의 이미지 코드 추출
    const codeText = document.getElementById("image-code")?.innerText || "";
    const finalCode = codeText.replace("재구입 이미지번호 : ", "").trim();
    loadMemo(currentViewId, finalCode);
});

document.getElementById("delete-memo-btn").addEventListener("click", async () => {
    if (!currentViewId) return;
    const snapshot = await getDocs(query(collection(db, "boards", currentViewId, "hanjool")));
    await Promise.all(snapshot.docs.map(doc => deleteDoc(doc.ref)));
    
    document.getElementById("memo-display").innerText = "작성된 메모가 없습니다.";
    document.getElementById("memo-status").classList.add("hidden");
});

// (기타 나머지 함수들 loadData, renderTable, goToPage는 기존과 동일하게 유지)
// ...
