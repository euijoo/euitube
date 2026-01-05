// ===== Firebase SDK import & 초기화 =====
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

// Firebase 설정
const firebaseConfig = {
  apiKey: "AIzaSyA-wThpRQqn1XaB8sIBO4J4Mq_kOQyTy04",
  authDomain: "ejtube-7a3b9.firebaseapp.com",
  projectId: "ejtube-7a3b9",
  storageBucket: "ejtube-7a3b9.firebasestorage.app",
  messagingSenderId: "1065039235604",
  appId: "1:1065039235604:web:ebd9ca5f3653df841a7501",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
const db = getFirestore(app);

// ===== 설정 =====

// YouTube Data API 키
const API_KEY = "AIzaSyBysIkRsY2eIwHAqv2oSA8uh6XLiBvXtQ4";

// Firestore 컬렉션 경로: users/{uid}/tracks
let currentUser = null;

// ===== 전역 상태 =====

let player = null;
let tracks = []; // { id, videoId, title, channel, thumbnail, addedAt }
let currentTrackId = null;

// ===== DOM 참조 =====
const miniPlayPauseBtn = document.getElementById("miniPlayPauseBtn");

// 로그인 화면
const loginScreen = document.getElementById("login-screen");
const googleLoginButton = document.getElementById("googleLoginButton");
const loginError = document.getElementById("loginError");

// 메인 화면
const mainScreen = document.getElementById("main-screen");
const logoutButton = document.getElementById("logoutButton");
const userEmailEl = document.getElementById("userEmail");

const addButton = document.getElementById("addButton");
const videoUrlInput = document.getElementById("videoUrl");
const clearListButton = document.getElementById("clearListButton");
const trackListEl = document.getElementById("trackList");

const titleEl = document.getElementById("title");
const artistEl = document.getElementById("artist");
const thumbnailEl = document.getElementById("thumbnail");

// ===== 유틸: videoId 추출 =====

function extractVideoId(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) {
      return u.pathname.slice(1);
    }
    if (u.searchParams.get("v")) {
      return u.searchParams.get("v");
    }
    const paths = u.pathname.split("/");
    return paths.pop() || paths.pop();
  } catch (e) {
    return null;
  }
}

// ===== Data API: 영상 정보 가져오기 =====

async function fetchVideoInfo(videoId) {
  const endpoint = "https://www.googleapis.com/youtube/v3/videos";
  const params = new URLSearchParams({
    key: API_KEY,
    part: "snippet",
    id: videoId,
  });

  const res = await fetch(`${endpoint}?${params.toString()}`);
  if (!res.ok) throw new Error("YouTube Data API 오류");
  const data = await res.json();

  if (!data.items || data.items.length === 0) {
    throw new Error("영상 정보를 찾을 수 없음");
  }

  const snippet = data.items[0].snippet;
  const thumbs = snippet.thumbnails || {};

  const bestThumb =
    thumbs.maxres?.url ||
    thumbs.standard?.url ||
    thumbs.high?.url ||
    thumbs.medium?.url ||
    thumbs.default?.url;

  return {
    title: snippet.title,
    channel: snippet.channelTitle,
    thumbnail: bestThumb,
  };
}

// ===== YouTube Iframe API 콜백 =====

function onYouTubeIframeAPIReady() {
  // 최초에는 아무것도 하지 않음
}
window.onYouTubeIframeAPIReady = onYouTubeIframeAPIReady;

// 플레이어 준비됐을 때: 미니 버튼 아이콘 초기화
function onPlayerReady() {
  miniPlayPauseBtn.textContent = "▶";
}

// 재생 상태 변경 (다음 곡 자동재생)
function onPlayerStateChange(event) {
  if (event.data === YT.PlayerState.ENDED) {
    if (!currentTrackId || tracks.length === 0) return;

    const currentIndex = tracks.findIndex((t) => t.id === currentTrackId);
    if (currentIndex === -1) return;

    const nextIndex = currentIndex + 1;
    if (nextIndex >= tracks.length) {
      // 마지막 곡이면 멈춤 (원하면 여기서 첫 곡으로 루프)
      return;
    }

    const nextTrack = tracks[nextIndex];
    playTrack(nextTrack.id);
  }
}

// ===== Firestore: 유저별 tracks 컬렉션 참조 =====

function getTracksCollectionRef(uid) {
  return collection(db, "users", uid, "tracks");
}

async function loadTracksFromFirestore() {
  if (!currentUser) return;

  const colRef = getTracksCollectionRef(currentUser.uid);
  const snap = await getDocs(colRef);
  const list = [];
  snap.forEach((docSnap) => {
    const data = docSnap.data();
    list.push({
      id: docSnap.id,
      videoId: data.videoId,
      title: data.title,
      channel: data.channel,
      thumbnail: data.thumbnail,
      addedAt: data.addedAt,
    });
  });

  tracks = list.sort((a, b) => b.addedAt - a.addedAt);
}

async function addTrackToFirestore(track) {
  if (!currentUser) return;
  const colRef = getTracksCollectionRef(currentUser.uid);
  const docRef = await addDoc(colRef, track);
  return docRef.id;
}

async function deleteTrackFromFirestore(id) {
  if (!currentUser) return;
  const docRef = doc(db, "users", currentUser.uid, "tracks", id);
  await deleteDoc(docRef);
}

async function clearTracksInFirestore() {
  if (!currentUser) return;
  const colRef = getTracksCollectionRef(currentUser.uid);
  const snap = await getDocs(colRef);
  const promises = [];
  snap.forEach((docSnap) => {
    promises.push(
      deleteDoc(doc(db, "users", currentUser.uid, "tracks", docSnap.id))
    );
  });
  await Promise.all(promises);
}

// ===== UI 렌더링 =====

// 리스트 아이템에 스와이프 제스처 붙이기
function attachSwipeToDelete(li) {
  let startX = 0;
  let currentX = 0;
  let isSwiping = false;

  li.addEventListener("touchstart", (e) => {
    if (e.touches.length !== 1) return;
    startX = e.touches[0].clientX;
    currentX = startX;
    isSwiping = true;
  });

  li.addEventListener("touchmove", (e) => {
    if (!isSwiping) return;
    currentX = e.touches[0].clientX;
  });

  li.addEventListener("touchend", () => {
    if (!isSwiping) return;
    const diffX = currentX - startX;

    if (diffX < -40) {
      // 왼쪽으로 스와이프 → 삭제 버튼 노출
      li.classList.add("swiped");
    } else if (diffX > 40) {
      // 오른쪽으로 스와이프 → 다시 닫기
      li.classList.remove("swiped");
    }

    startX = 0;
    currentX = 0;
    isSwiping = false;
  });
}

function renderTrackList() {
  trackListEl.innerHTML = "";

  if (tracks.length === 0) {
    const empty = document.createElement("li");
    empty.textContent = "아직 추가된 영상이 없습니다.";
    empty.style.fontSize = "13px";
    empty.style.color = "#9ca3af";
    trackListEl.appendChild(empty);
    return;
  }

  tracks.forEach((track) => {
    const li = document.createElement("li");
    li.className = "track-item";
    li.dataset.trackId = track.id;

    if (track.id === currentTrackId) {
      li.classList.add("active");
    }

    // 안쪽 컨텐츠 (스와이프되는 영역)
    const inner = document.createElement("div");
    inner.className = "track-item-inner";

    const img = document.createElement("img");
    img.className = "track-item-thumb";
    img.src = track.thumbnail;
    img.alt = track.title;

    const textBox = document.createElement("div");
    textBox.className = "track-item-text";

    const titleDiv = document.createElement("div");
    titleDiv.className = "track-item-title";
    titleDiv.textContent = track.title;

    const artistDiv = document.createElement("div");
    artistDiv.className = "track-item-artist";
    artistDiv.textContent = track.channel;

    textBox.appendChild(titleDiv);
    textBox.appendChild(artistDiv);

    inner.appendChild(img);
    inner.appendChild(textBox);

    // 삭제 버튼 (오른쪽 고정 영역)
    const delBtn = document.createElement("button");
    delBtn.className = "track-item-delete";
    delBtn.textContent = "삭제";

    inner.addEventListener("click", () => {
      playTrack(track.id);
    });

    delBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      await deleteTrack(track.id);
    });

    li.appendChild(inner);
    li.appendChild(delBtn);
    trackListEl.appendChild(li);

    attachSwipeToDelete(li);
  });
}

function updateNowPlaying(track) {
  titleEl.textContent = track.title;
  artistEl.textContent = track.channel;
  thumbnailEl.src = track.thumbnail;

  const miniThumb = document.getElementById("miniThumb");
  const miniTitle = document.getElementById("miniTitle");
  const miniArtist = document.getElementById("miniArtist");
  if (miniThumb && miniTitle && miniArtist) {
    miniThumb.src = track.thumbnail;
    miniTitle.textContent = track.title;
    miniArtist.textContent = track.channel;
  }
}

// ===== 트랙 추가/삭제/재생 =====

async function addTrackFromUrl(url) {
  if (!currentUser) {
    alert("먼저 Google 계정으로 로그인해 주세요.");
    return;
  }

  const videoId = extractVideoId(url);
  if (!videoId) {
    alert("유효한 YouTube 주소가 아닌 것 같아요.");
    return;
  }

  try {
    const info = await fetchVideoInfo(videoId);

    const newTrackData = {
      videoId,
      title: info.title,
      channel: info.channel,
      thumbnail: info.thumbnail,
      addedAt: Date.now(),
    };

    const docId = await addTrackToFirestore(newTrackData);

    const newTrack = {
      id: docId,
      ...newTrackData,
    };

    tracks.unshift(newTrack);
    currentTrackId = newTrack.id;
    updateNowPlaying(newTrack);
    renderTrackList();
    playVideoById(videoId);
  } catch (err) {
    console.error(err);
    alert("영상 정보를 불러오는 중 문제가 발생했어요.");
  }
}

async function deleteTrack(id) {
  await deleteTrackFromFirestore(id);

  const index = tracks.findIndex((t) => t.id === id);
  if (index === -1) return;

  tracks.splice(index, 1);

  if (currentTrackId === id) {
    currentTrackId = tracks[0]?.id || null;
    if (currentTrackId) {
      updateNowPlaying(tracks[0]);
      playVideoById(tracks[0].videoId);
    }
  }

  renderTrackList();
}

function playTrack(id) {
  const track = tracks.find((t) => t.id === id);
  if (!track) return;

  currentTrackId = id;
  updateNowPlaying(track);
  playVideoById(track.videoId);
  renderTrackList();
}

function playVideoById(videoId) {
  if (!player) {
    player = new YT.Player("player", {
      width: "640",
      height: "360",
      videoId,
      playerVars: {
        rel: 0,
        playsinline: 1,
      },
      events: {
        onReady: onPlayerReady,
        onStateChange: onPlayerStateChange,
      },
    });
  } else {
    player.loadVideoById(videoId);
  }
}

// ===== Google 로그인/로그아웃 =====

googleLoginButton.addEventListener("click", async () => {
  try {
    loginError.textContent = "";
    await signInWithPopup(auth, provider);
  } catch (err) {
    console.error(err);
    loginError.textContent =
      "로그인 중 문제가 발생했어요. 잠시 후 다시 시도해 주세요.";
  }
});

logoutButton.addEventListener("click", async () => {
  try {
    await signOut(auth);
  } catch (err) {
    console.error(err);
    alert("로그아웃 중 문제가 발생했어요.");
  }
});

// 로그인 상태 감시
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    userEmailEl.textContent = user.email || "";

    loginScreen.style.display = "none";
    mainScreen.classList.remove("hidden");

    await loadTracksFromFirestore();
    renderTrackList();

    if (tracks.length > 0) {
      const first = tracks[0];
      currentTrackId = first.id;
      updateNowPlaying(first);
    } else {
      titleEl.textContent = "제목";
      artistEl.textContent = "아티스트";
      thumbnailEl.removeAttribute("src");
    }
  } else {
    currentUser = null;
    tracks = [];
    currentTrackId = null;

    loginScreen.style.display = "flex";
    mainScreen.classList.add("hidden");
    loginError.textContent = "";
  }
});

// ===== 이벤트 바인딩 =====

addButton.addEventListener("click", () => {
  const url = videoUrlInput.value.trim();
  if (!url) return;
  addTrackFromUrl(url);
  videoUrlInput.value = "";
});

videoUrlInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    addButton.click();
  }
});

clearListButton.addEventListener("click", async () => {
  if (!currentUser) {
    alert("먼저 Google 계정으로 로그인해 주세요.");
    return;
  }
  if (!confirm("정말 전체 리스트를 비울까요?")) return;

  await clearTracksInFirestore();
  tracks = [];
  currentTrackId = null;
  renderTrackList();
  titleEl.textContent = "제목";
  artistEl.textContent = "아티스트";
  thumbnailEl.removeAttribute("src");
});

// ===== 미니 플레이어 재생/일시정지 버튼 =====

miniPlayPauseBtn.addEventListener("click", () => {
  if (!player) return;

  const state = player.getPlayerState();

  if (state === YT.PlayerState.PLAYING) {
    player.pauseVideo();
    miniPlayPauseBtn.textContent = "▶";
  } else {
    player.playVideo();
    miniPlayPauseBtn.textContent = "⏸";
  }
});
