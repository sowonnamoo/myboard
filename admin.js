import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, getDocs, query, writeBatch, doc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// 기존 index.html에서 쓰던 firebaseConfig와 동일하게 넣으세요
const firebaseConfig = {
    apiKey: "AIzaSynRd2aA",
    authDomain: "board-pp.com",
    projectId: "be3",
    storageBucket: "board-2orage.app",
    messagingSenderId: "2586316",
    appId: "1:2588176633fff11b209"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

document.getElementById("mask-info-btn").addEventListener("click", async () => {
    if (!confirm("마스킹 작업을 시작합니다. F12(콘솔)창에서 상세 진행 상황을 확인하세요!")) return;

    const status = document.getElementById("status");
    status.innerText = "데이터 분석 중...";

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    console.log("기준 날짜 (이보다 옛날이면 마스킹):", thirtyDaysAgo);

    const q = query(collection(db, "boards"));
    const snapshot = await getDocs(q);
    
    let count = 0;
    
    snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        
        // 날짜 변환 (타임스탬프 형식 대응)
        const createdAt = data.createdAt?.toDate ? data.createdAt.toDate() : null;
        
        console.log("------------------");
        console.log("글 ID:", docSnap.id);
        console.log("글 날짜:", createdAt);

        if (createdAt && createdAt < thirtyDaysAgo) {
            console.log("✅ 결과: 마스킹 대상입니다.");
            count++;
        } else {
            console.log("❌ 결과: 마스킹 제외 (30일 이내거나 날짜 없음)");
        }
    });

    status.innerText = `분석 완료! 총 ${count}개의 글이 마스킹 대상입니다. (상세 내용은 F12 콘솔 확인)`;
});
