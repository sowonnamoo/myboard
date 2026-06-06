if (dImage) {
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
    
    const imgUrl = `https://sowonnamoo1005.cafe24.com/1/${finalCode}.jpg`;
    const timestamp = new Date().getTime();

    // 1. 이미지가 없을 때를 대비한 스타일 및 로직 추가
    dImage.innerHTML = `
        <div id="image-container" style="position: relative; width: 744px; height: 500px; margin: 0 auto; border: 1px solid black; display: flex; align-items: center; justify-content: center; background-color: #f9f9f9;">
            <p id="loading-msg" style="color: #666; font-size: 16px;">시안이 제작중 입니다.<br>결제확인 되시면 제작후 업로드 됩니다.</p>
            <a href="${imgUrl}?t=${timestamp}" target="_blank" class="auto-refresh-link" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;">
                <img src="${imgUrl}?t=${timestamp}" 
                     class="auto-refresh-img" 
                     alt="시안 이미지" 
                     onerror="this.style.display='none'; document.getElementById('loading-msg').style.display='block';"
                     onload="document.getElementById('loading-msg').style.display='none';"
                     style="width: 100%; height: 100%; object-fit: contain; cursor: pointer;">
            </a>
        </div>
        <div style="text-align: right; margin-top: 5px; font-size: 9pt; font-weight: bold; color: black; padding-right: 20px;">
            재구입 이미지번호 : ${finalCode}
        </div>
    `;
}
