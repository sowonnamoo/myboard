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
    if (!confirm("정말 30일 지난 모든 글의 정보를 마스킹 하시겠습니까?")) return;

    const status = document.getElementById("status");
    status.innerText = "데이터 불러오는 중...";

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const q = query(collection(db, "boards"));
    const snapshot = await getDocs(q);
    const batch = writeBatch(db);
    let count = 0;

    snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const createdAt = data.createdAt?.toDate();

        if (createdAt && createdAt < thirtyDaysAgo) {
            let updateData = {};
            
            // 전화번호 앞 5자리 마스킹 처리
            if (data.phone && !data.phone.includes("[개인정보보호]")) {
                updateData.phone = "[개인정보보호]" + data.phone.substring(5);
            }
            
            // 주소 뒷 6자리 마스킹 처리
            if (data.address && !data.address.includes("[개인정보보호]")) {
                const addr = data.address;
                updateData.address = addr.substring(0, Math.max(0, addr.length - 6)) + "[개인정보보호]";
            }

            if (Object.keys(updateData).length > 0) {
                batch.update(docSnap.ref, updateData);
                count++;
            }
        }
    });

    if (count > 0) {
        await batch.commit();
        status.innerText = `성공! 총 ${count}개의 글이 마스킹되었습니다.`;
    } else {
        status.innerText = "수정할 대상이 없습니다.";
    }
});