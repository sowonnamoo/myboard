import { db } from './firebase-config.js';
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.0.0/firebase-firestore.js";

window.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    document.getElementById('productName').value = params.get('product') || '';
    document.getElementById('sizeDisplay').value = `${params.get('width') || 0} x ${params.get('height') || 0}`;
    document.getElementById('quantity').value = (params.get('qty') || 0) + '개';
    document.getElementById('price').value = (params.get('price') || 0) + '원';
    document.getElementById('hoo').value = params.get('hoo') || '';
    document.getElementById('message').value = params.get('message') || '';

    if(params.get('f1')) { document.getElementById('file1Link').href = params.get('f1'); document.getElementById('file1Link').style.display = 'inline-block'; }
    if(params.get('f2')) { document.getElementById('file2Link').href = params.get('f2'); document.getElementById('file2Link').style.display = 'inline-block'; }
});

window.submitOrder = async function() {
    const phone = document.getElementById('phone').value;
    const params = new URLSearchParams(window.location.search);

    if(!document.getElementById('author').value || !phone) return alert("성함과 연락처는 필수입니다.");

    const data = {
        createdAt: serverTimestamp(),
        productName: params.get('product'),
        size: { width: params.get('width'), height: params.get('height') },
        quantity: parseInt(params.get('qty')),
        price: parseInt(params.get('price')),
        hoo: params.get('hoo'),
        message: params.get('message'),
        file1Url: params.get('f1'),
        file2Url: params.get('f2'),
        author: document.getElementById('author').value,
        phone: phone,
        address: document.getElementById('address').value,
        password: phone.slice(-4),
        paymentMethod: document.getElementById('paymentMethod').value,
        status: "대기"
    };

    try {
        await addDoc(collection(db, "iiii"), data);
        alert("접수가 완료되었습니다.");
    } catch (e) {
        alert("저장 실패");
    }
};

window.execDaumPostcode = function() {
    new daum.Postcode({ oncomplete: (data) => document.getElementById('address').value = data.address }).open();
};