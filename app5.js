import { db } from './firebase-config.js';
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.0.0/firebase-firestore.js";

const cart = JSON.parse(localStorage.getItem("cart")) || [];





// 장바구니
function renderCart() {
    const list = document.getElementById("cart-list");
    const cart = JSON.parse(localStorage.getItem("cart")) || []; // 여기서 데이터를 불러옴
    
    if (cart.length === 0) {
        list.innerHTML = "<p>장바구니가 비어 있습니다.</p>";
        return;
    }

    let total = 0;
    list.innerHTML = "";
    
    cart.forEach(item => {
        const price = Number(item.price) || 0;
        total += price;
        list.innerHTML += `
        <div class="cart-item">
            <b>${item.item}</b> | 사이즈: ${item.width}x${item.height} | 수량: ${item.qty}개 | ${price.toLocaleString()}원
        </div>`;
    });
    document.getElementById("total-price").innerText = "총 결제금액 : " + total.toLocaleString() + "원";
}

// 페이지가 로드되면 무조건 실행되게 함
renderCart();









// 접수 처리 (상품별 개별 문서 저장)
window.submitOrder = async function() {
    const author = document.getElementById('author').value;
    const phone = document.getElementById('phone').value;
    const address = document.getElementById('address').value;
    const message = document.getElementById('message').value;
    const paymentMethod = document.getElementById('paymentMethod').value;

    if(!author || !phone) return alert("성함과 연락처는 필수입니다.");

    try {
        // 장바구니 상품을 하나씩 각각의 문서로 저장
        for (const item of cart) {
            const data = {
                createdAt: serverTimestamp(),
                productName: item.item,
                gaa: item.width,
                seee: item.height,
                quantity: item.qty,
                price: item.price,
                message: message,
                author: author,
                phone: phone,
                address: address,
                paymentMethod: paymentMethod,
                password: phone.slice(-4),
                status: "대기"
            };
            await addDoc(collection(db, "iiii"), data);
        }
        
        alert("모든 상품이 각각 접수되었습니다.");
        localStorage.removeItem("cart"); // 접수 완료 후 장바구니 초기화
        window.location.reload();
    } catch (e) {
        alert("저장 실패: " + e.message);
    }
};

window.execDaumPostcode = function() {
    new daum.Postcode({ oncomplete: (data) => document.getElementById('address').value = data.address }).open();
};

renderCart();
