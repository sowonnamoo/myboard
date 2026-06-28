import { db } from './firebase-config.js';
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.0.0/firebase-firestore.js";

// 로컬스토리지에서 장바구니 데이터 가져오기
let cart = JSON.parse(localStorage.getItem("cart")) || [];

window.addEventListener('DOMContentLoaded', () => {
    renderCart();
});

function renderCart() {
    const list = document.getElementById("cart-list");
    let total = 0;
    list.innerHTML = "";
    
    cart.forEach(item => {
        total += Number(item.price);
        list.innerHTML += `
        <div class="cart-item">
            <b>${item.item}</b><br>
            사이즈: ${item.width} x ${item.height} | 수량: ${item.qty}개 | 금액: ${Number(item.price).toLocaleString()}원
        </div>`;
    });
    document.getElementById("total-price").innerText = "총 결제금액 : " + total.toLocaleString() + "원";
}

window.submitOrder = async function() {
    const phone = document.getElementById('phone').value;
    const author = document.getElementById('author').value;
    
    if(!author || !phone) return alert("성함과 연락처는 필수입니다.");

    // 장바구니 전체 데이터와 주문자 정보를 병합하여 저장
    const data = {
        createdAt: serverTimestamp(),
        items: cart, // 장바구니 상품 배열 저장
        totalPrice: cart.reduce((sum, item) => sum + Number(item.price), 0),
        message: document.getElementById('message').value,
        author: author,
        phone: phone,
        address: document.getElementById('address').value,
        password: phone.slice(-4),
        paymentMethod: document.getElementById('paymentMethod').value,
        status: "대기"
    };

    try {
        await addDoc(collection(db, "iiii"), data);
        alert("접수가 완료되었습니다.");
        localStorage.removeItem("cart"); // 주문 후 비우기
        window.location.reload();
    } catch (e) {
        alert("저장 실패: " + e.message);
    }
};

window.execDaumPostcode = function() {
    new daum.Postcode({ oncomplete: (data) => document.getElementById('address').value = data.address }).open();
};
