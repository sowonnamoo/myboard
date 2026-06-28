import { db } from './firebase-config.js';
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.0.0/firebase-firestore.js";

const cart = JSON.parse(localStorage.getItem("cart")) || [];

// 1. 화면 렌더링
const list = document.getElementById("cart-list");
let total = 0;
cart.forEach(item => {
    total += item.price;
    list.innerHTML += `<div class="cart-item">${item.productName} - ${item.price}원</div>`;
});
document.getElementById("total-price").innerText = "총액: " + total + "원";

// 2. 저장 로직
window.submitOrder = async function() {
    const author = document.getElementById('author').value;
    const phone = document.getElementById('phone').value;
    const address = document.getElementById('address').value;
    const message = document.getElementById('message').value;

    if(!author || !phone) return alert("필수항목을 입력하세요.");

    for (const item of cart) {
        await addDoc(collection(db, "iiii"), {
            ...item, // 상품 정보 그대로 저장
            author, phone, address, message,
            createdAt: serverTimestamp(),
            status: "대기"
        });
    }
    alert("접수 완료!");
    localStorage.removeItem("cart");
    location.reload();
};
