import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, deleteDoc, doc, query, orderBy, increment, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

  const firebaseConfig = {
    apiKey: "AIzaSyDU8d6ShVNtgLYEQZeyms88G-TDNnRd2aA",
    authDomain: "board-291e3.firebaseapp.com",
    projectId: "board-291e3",
    storageBucket: "board-291e3.firebasestorage.app",
    messagingSenderId: "25881766316",
    appId: "1:25881766316:web:c03e118cf26d3fff11b209"
  };

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const ordersCollection = collection(db, "orders");

// 🖥️ 화면 전환 단순 제어
window.switchView = function(viewName) {
    document.getElementById("view-list").classList.add("hidden");
    document.getElementById("view-write").classList.add("hidden");
    document.getElementById("view-detail").classList.add("hidden");

    if (viewName === 'list') { document.getElementById("view-list").classList.remove("hidden"); fetchOrders(); }
    else if (viewName === 'write') { document.getElementById("view-write").classList.remove("hidden"); }
    else if (viewName === 'detail') { document.getElementById("view-detail").classList.remove("hidden"); }
}

// 🚀 구글 드라이브 연동 모듈 전용 빈 방 (나중에 이 부분만 채우시면 됩니다)
async function uploadToGoogleDrive(fileInputId) {
    const fileInput = document.getElementById(fileInputId);
    if (!fileInput || fileInput.files.length === 0) return null;
    return "https://drive.google.com/drive/my-drive"; 
}

// 📥 목록 불러오기
async function fetchOrders() {
    const listBody = document.getElementById("list-body");
    listBody.innerHTML = "";

    try {
        const q = query(ordersCollection, orderBy("createdAt", "desc"));
        const snapshot = await getDocs(q);
        let index = snapshot.size;

        if (snapshot.empty) {
            listBody.innerHTML = `<tr><td colspan="4" class="py-8 text-gray-400 text-center text-sm">등록된 주문 내역이 없습니다.</td></tr>`;
            return;
        }

        snapshot.forEach((orderDoc) => {
            const data = orderDoc.data();
            const dateStr = data.createdAt ? data.createdAt.toDate().toLocaleDateString('ko-KR', {month:'2-digit', day:'2-digit'}) : "";

            listBody.innerHTML += `
                <tr class="hover:bg-gray-50 border-b cursor-pointer text-gray-700 text-center" onclick="viewDetail('${orderDoc.id}')">
                    <td class="py-3 text-xs text-gray-400">${index--}</td>
                    <td class="py-3 px-4 text-left font-medium text-blue-600 hover:underline">🔒 ${data.productName} 시안입니다.</td>
                    <td class="py-3 text-xs text-gray-500">${data.author}</td>
                    <td class="py-3 text-xs text-gray-400">${dateStr}</td>
                </tr>
            `;
        });
    } catch (err) { console.error(err); }
}

// 🔍 글 상세조회 (비밀번호 체크)
window.viewDetail = async function(id) {
    const snap = await getDoc(doc(db, "orders", id));
    if (!snap.exists()) return;
    const data = snap.data();
    
    if (prompt("비밀번호를 입력하세요 (핸드폰 뒷자리 4폰번):") !== data.password) {
        alert("비밀번호가 다릅니다."); return;
    }

    await updateDoc(doc(db, "orders", id), { views: increment(1) });

    document.getElementById("detail-title").innerText = `${data.productName} 스티커 / 도안 접수`;
    document.getElementById("detail-author").innerText = `작성자: ${data.author}`;
    document.getElementById("detail-date").innerText = `작성일: ${data.createdAt ? data.createdAt.toDate().toLocaleString('ko-KR') : ''}`;
    document.getElementById("detail-views").innerText = `조회: ${data.views + 1}`;
    document.getElementById("detail-qty").innerText = data.quantity;
    document.getElementById("detail-size").innerText = data.size;
    document.getElementById("detail-phone").innerText = data.phone;
    document.getElementById("detail-address").innerText = data.address;
    document.getElementById("detail-msg").innerText = data.message || "내용 없음";

    const filesDiv = document.getElementById("detail-files");
    filesDiv.innerHTML = "";
    if(data.file1Url) filesDiv.innerHTML += `<a href="${data.file1Url}" target="_blank" class="block text-xs text-blue-600 hover:underline">📁 첨부파일 1 (구글 드라이브)</a>`;
    if(data.file2Url) filesDiv.innerHTML += `<a href="${data.file2Url}" target="_blank" class="block text-xs text-blue-600 hover:underline">📁 첨부파일 2 (구글 드라이브)</a>`;
    if(!data.file1Url && !data.file2Url) filesDiv.innerHTML = `<span class="text-xs text-gray-400">첨부 없음</span>`;

    document.getElementById("detail-delete-btn").onclick = async () => {
        if (confirm("정말 삭제하시겠습니까?")) {
            await deleteDoc(doc(db, "orders", id));
            switchView('list');
        }
    };
    switchView('detail');
}

// 💽 주문 데이터 DB 저장
document.getElementById("save-btn").addEventListener("click", async () => {
    const pName = document.getElementById("product-name").value.trim();
    const qty = document.getElementById("quantity").value.trim();
    const size = document.getElementById("size").value.trim();
    const phone = document.getElementById("phone").value.trim();
    const address = document.getElementById("address").value.trim();
    const password = document.getElementById("password").value.trim();
    const message = document.getElementById("message").value;

    if (!pName || !qty || !size || !phone || !address || !password) {
        alert("필수 항목을 입력해주세요."); return;
    }

    try {
        const file1Url = await uploadToGoogleDrive("file-1");
        const file2Url = await uploadToGoogleDrive("file-2");
        const authorName = phone.length > 4 ? `(주)고객_${phone.slice(-4)}` : "고객";

        await addDoc(ordersCollection, {
            productName: pName, quantity: qty, size: size, phone: phone, address: address,
            password: password, message: message, author: authorName,
            file1Url, file2Url, views: 0, createdAt: new Date()
        });

        alert("접수되었습니다.");
        document.querySelectorAll("#view-write input, #view-write textarea").forEach(el => el.value = "");
        switchView('list');
    } catch (e) { alert(e.message); }
});

document.getElementById("go-write-btn").addEventListener("click", () => switchView('write'));
fetchOrders();