import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, deleteDoc, updateDoc, doc, query, orderBy, increment, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// 🔥 본인의 Firebase 설정을 채워 넣어 주세요!
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_AUTH_DOMAIN",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_STORAGE_BUCKET",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_APP_ID"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const boardsCollection = collection(db, "boards");

let allDocs = [];
let filteredDocs = [];
let showAll = false;

// 시간 포맷
function formatTime(timestamp) {
    if (!timestamp) return "방금 전";
    const date = timestamp.toDate();
    return date.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }) + ' ' + date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
}

// 🚀 [보완 핵심] 구글 드라이브 업로드 가상 함수
// 향후 구글 API 세팅이 끝나면 이 내부 로직만 교체하면 됩니다.
async function uploadToGoogleDrive(fileInputId) {
    const fileInput = document.getElementById(fileInputId);
    if (!fileInput || fileInput.files.length === 0) return null;

    const file = fileInput.files[0];
    console.log(`${file.name} 구글 드라이브 업로드 준비 중...`);
    
    /* 
       TODO: 추후 Google Drive API 연동 코드 삽입 구역
       - Access Token 필요
       - Multipart upload 수행 후 webViewLink 받아오기
    */

    // 임시 리턴 처리 (작동 구조 연동 확인용)
    return "https://drive.google.com/drive/my-drive"; 
}

// 데이터 서버에서 로드
async function fetchPostsFromServer() {
    try {
        const q = query(boardsCollection, orderBy("createdAt", "desc"));
        const querySnapshot = await getDocs(q);
        allDocs = [];
        querySnapshot.forEach(doc => { allDocs.push({ id: doc.id, ...doc.data() }); });
        filterPosts(); 
    } catch (error) {
        console.error(error);
        document.getElementById("posts-list").innerHTML = `<p class="text-rose-500 text-sm">불러오기 실패</p>`;
    }
}

// 검색 필터링
function filterPosts() {
    const keyword = document.getElementById("search-input").value.trim().toLowerCase();
    if (!keyword) { filteredDocs = [...allDocs]; } 
    else {
        filteredDocs = allDocs.filter(post => {
            return (post.title || "").toLowerCase().includes(keyword) || (post.author || "").toLowerCase().includes(keyword);
        });
    }
    document.getElementById("post-count").innerText = keyword ? `검색 결과 ${filteredDocs.length}개` : `총 ${allDocs.length}개의 글`;
    renderPosts();
}

// 화면 렌더링
function renderPosts() {
    const postsList = document.getElementById("posts-list");
    const panel = document.getElementById("bottom-control-panel");
    const moreBtn = document.getElementById("load-more-btn");
    postsList.innerHTML = "";

    if (allDocs.length === 0) {
        postsList.innerHTML = `<div class="text-center py-16 bg-white rounded-2xl border border-slate-200"><p class="text-slate-400 text-sm">첫 글을 남겨보세요!</p></div>`;
        panel.classList.add("hidden");
        return;
    }
    if (filteredDocs.length === 0) {
        postsList.innerHTML = `<div class="text-center py-16 bg-white rounded-2xl border border-slate-100"><p class="text-slate-400 text-sm">검색 결과가 없습니다.</p></div>`;
        panel.classList.remove("hidden");
        moreBtn.classList.add("hidden");
        return;
    }

    panel.classList.remove("hidden");
    const targetDocs = showAll ? filteredDocs : filteredDocs.slice(0, 10);

    targetDocs.forEach((post) => {
        const id = post.id;
        const hasFiles = (post.file1Url || post.file2Url) ? "💚" : ""; // 구글 상징 초록색 이모지
        const isPrivate = post.isPrivate || false;

        const displayTitle = isPrivate ? "🔒 비밀글입니다." : `${post.title} ${hasFiles}`;
        const displayContent = isPrivate ? "비밀번호를 입력해야 볼 수 있습니다." : post.content;

        const postHtml = `
            <div class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:shadow-md transition" data-id="${id}">
                <div class="flex items-center justify-between mb-3">
                    <div class="flex items-center space-x-2">
                        <span class="text-sm font-semibold text-slate-700">${post.author || "익명"}</span>
                        <span class="text-xs text-slate-400">•</span>
                        <span class="text-xs text-slate-400">${formatTime(post.createdAt)}</span>
                    </div>
                    <div class="flex items-center space-x-3 text-xs text-slate-400">
                        <span>👁️ ${post.views || 0}</span>
                        <button class="delete-btn text-rose-500 hover:underline" data-id="${id}" data-pw="${post.password}">삭제</button>
                    </div>
                </div>
                <h4 class="text-base font-bold text-slate-900 mb-2 cursor-pointer hover:text-indigo-600 post-title" data-id="${id}" data-private="${isPrivate}">${displayTitle}</h4>
                <p class="text-sm text-slate-600 leading-relaxed mb-4 cursor-pointer post-title" data-id="${id}" data-private="${isPrivate}">${displayContent}</p>
            </div>
        `;
        postsList.innerHTML += postHtml;
    });

    if (filteredDocs.length > 10) {
        moreBtn.classList.remove("hidden");
        moreBtn.innerText = showAll ? "접기 ▲" : `더보기 ▼`;
    } else {
        moreBtn.classList.add("hidden");
    }
    bindPostEvents();
}

// 이벤트 바인딩
function bindPostEvents() {
    document.querySelectorAll(".post-title").forEach(element => {
        element.addEventListener("click", async (e) => {
            const docId = e.target.closest('[data-id]').getAttribute("data-id");
            const isPrivate = e.target.getAttribute("data-private") === "true";
            
            const docRef = doc(db, "boards", docId);
            const docSnap = await getDoc(docRef);
            if (!docSnap.exists()) return;
            const post = docSnap.data();

            if (isPrivate) {
                const inputPassword = prompt("비밀번호를 입력하세요:");
                if (inputPassword !== post.password) { alert("틀렸습니다."); return; }
            }

            await updateDoc(docRef, { views: increment(1) });
            
            document.getElementById("modal-meta").innerText = `작성자: ${post.author} | ${formatTime(post.createdAt)}`;
            document.getElementById("modal-title").innerText = post.title;
            document.getElementById("modal-content").innerText = post.content;
            
            const filesDiv = document.getElementById("modal-files");
            filesDiv.innerHTML = "";
            
            if (post.file1Url || post.file2Url) {
                filesDiv.innerHTML = `<p class="text-xs font-bold text-slate-400 mb-1">구글 드라이브 첨부파일</p>`;
                if (post.file1Url) {
                    filesDiv.innerHTML += `<a href="${post.file1Url}" target="_blank" class="block text-xs text-emerald-600 bg-emerald-50 p-2.5 rounded-xl border border-emerald-100 truncate mb-1">📁 구글 드라이브 파일 1 열기</a>`;
                }
                if (post.file2Url) {
                    filesDiv.innerHTML += `<a href="${post.file2Url}" target="_blank" class="block text-xs text-emerald-600 bg-emerald-50 p-2.5 rounded-xl border border-emerald-100 truncate">📁 구글 드라이브 파일 2 열기</a>`;
                }
            }

            document.getElementById("secret-modal").classList.remove("hidden");
        });
    });

    // 삭제 버튼 이벤트
    document.querySelectorAll(".delete-btn").forEach(button => {
        button.addEventListener("click", async (e) => {
            e.stopPropagation();
            const docId = e.target.getAttribute("data-id");
            const realPassword = e.target.getAttribute("data-pw");
            const inputPassword = prompt("비밀번호 입력:");
            if (inputPassword === realPassword && confirm("삭제하시겠습니까?")) {
                await deleteDoc(doc(db, "boards", docId));
                fetchPostsFromServer();
            }
        });
    });
}

// 게시글 저장
document.getElementById("save-btn").addEventListener("click", async () => {
    const saveBtn = document.getElementById("save-btn");
    saveBtn.disabled = true;
    saveBtn.innerText = "업로드 중...";

    try {
        // 💡 쪼개놓은 가상 구글 드라이브 업로드 함수 실행
        const file1Url = await uploadToGoogleDrive("file-1");
        const file2Url = await uploadToGoogleDrive("file-2");

        await addDoc(boardsCollection, {
            author: document.getElementById("author").value,
            password: document.getElementById("password").value,
            phone: document.getElementById("phone").value || null,
            isPrivate: document.getElementById("is-private").checked,
            title: document.getElementById("title").value,
            content: document.getElementById("content").value,
            file1Url: file1Url,
            file2Url: file2Url,
            views: 0,
            createdAt: new Date()
        });
        
        // 입력 폼 초기화
        document.getElementById("title").value = "";
        document.getElementById("content").value = "";
        document.getElementById("file-1").value = "";
        document.getElementById("file-2").value = "";
        
        fetchPostsFromServer();
        alert("성공적으로 등록되었습니다!");
    } catch (e) {
        alert("실패: " + e.message);
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerText = "게시하기";
    }
});

// 이벤트 리스너 세팅
document.getElementById("search-input").addEventListener("input", () => { showAll = false; filterPosts(); });
document.getElementById("load-more-btn").addEventListener("click", () => { showAll = !showAll; renderPosts(); });
document.getElementById("modal-close-btn").addEventListener("click", () => { document.getElementById("secret-modal").classList.add("hidden"); fetchPostsFromServer(); });

// 실행
fetchPostsFromServer();
