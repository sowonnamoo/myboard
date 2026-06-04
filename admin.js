import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, getDocs, doc, updateDoc, query } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// 1. 파이어베이스 설정 (본인의 환경에 맞게 입력)
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

// 2. 마스킹 실행 함수
document.getElementById("mask-info-btn").addEventListener("click", async () => {
    if (!confirm("30일 지난 게시글의 개인정보를 마스킹하시겠습니까?")) return;

    const status = document.getElementById("status");
    status.innerText = "작업 중...";

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    try {
        const q = query(collection(db, "boards"));
        const snapshot = await getDocs(q);
        
        let count = 0;
        
        for (const docSnap of snapshot.docs) {
            const data = docSnap.data();
            const createdAt = data.createdAt?.toDate ? data.createdAt.toDate() : null;

            // 30일이 지난 데이터인가?
            if (createdAt && createdAt < thirtyDaysAgo) {
                
                // 마스킹 로직 적용
                const rawPhone = data.phone || "";
                const maskedPhone = rawPhone.length > 4 ? "******" + rawPhone.slice(-4) : "******";

                const rawAddress = data.address || "";
                const maskedAddress = rawAddress.length > 5 ? rawAddress.slice(0, -5) + "*****" : "*****";

                // 이미 마스킹된 데이터가 아니라면 업데이트
                if (data.phone !== maskedPhone || data.address !== maskedAddress) {
                    await updateDoc(doc(db, "boards", docSnap.id), {
                        phone: maskedPhone,
                        address: maskedAddress
                    });
                    console.log(`✅ 마스킹 성공: ${docSnap.id}`);
                    count++;
                }
            }
        }
        
        status.innerText = `작업 완료! 총 ${count}개의 글이 마스킹되었습니다.`;
        alert(`마스킹 완료: ${count}개 수정됨`);
        
    } catch (error) {
        console.error("작업 중 오류 발생:", error);
        status.innerText = "오류 발생! 콘솔(F12)을 확인하세요.";
    }
});
