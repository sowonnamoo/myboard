import { db } from './firebase-config.js';
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.0.0/firebase-firestore.js";

window.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    
    // 쿼리 데이터 매핑
    const gaa = params.get('width') || 0;
    const seee = params.get('height') || 0;
    
    document.getElementById('productName').value = params.get('product') || '';
    document.getElementById('sizeCombined').value = `${gaa} x ${seee}`;
    document.getElementById('gaa').value = gaa;
    document.getElementById('seee').value = seee;
    document.getElementById('quantity').value = (params.get('qty') || 0) + '개';
    document.getElementById('price').value = (params.get('price') || 0) + '원';
    document.getElementById('hoo').value = params.get('hoo') || '';
    document.getElementById('message').value = params.get('message') || '';

    if(params.get('f1')) { document.getElementById('file1Link').href = params.get('f1'); document.getElementById('file1Link').style.display = 'inline-block'; }
    if(params.get('f2')) { document.getElementById('file2Link').href = params.get('f2'); document.getElementById('file2Link').style.display = 'inline-block'; }
});

window.submitOrder = async function() {
    const phone = document.getElementById('phone').value;
    const author = document.getElementById('author').value;
    const params = new URLSearchParams(window.location.search);

    if(!author || !phone) return alert("성함과 연락처를 모두 입력해주세요.");

    const data = {
        createdAt: serverTimestamp(),
        productName: params.get('product'),
        size: document.getElementById('sizeCombined').value,
        gaa: parseInt(document.getElementById('gaa').value),
        seee: parseInt(document.getElementById('seee').value),
        quantity: parseInt(params.get('qty')),
        price: parseInt(params.get('price')),
        hoo: params.get('hoo'),
        message: params.get('message'),
        file1Url: params.get('f1'),
        file2Url: params.get('f2'),
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
        window.location.reload();
    } catch (e) {
        alert("저장 실패: " + e.message);
    }
};

window.execDaumPostcode = function() {
    new daum.Postcode({ oncomplete: (data) => document.getElementById('address').value = data.address }).open();
};