// 👉 여기 API 키 넣기
const API_KEY = "AIzaSyBysIkRsY2eIwHAqv2oSA8uh6XLiBvXtQ4";
let player = null;

// URL에서 videoId 추출
function extractVideoId(url) {
  try {
    const u = new URL(url);

    // youtu.be 단축 주소
    if (u.hostname.includes("youtu.be")) {
      return u.pathname.slice(1);
    }

    // youtube.com/watch?v=VIDEO_ID
    if (u.searchParams.get("v")) {
      return u.searchParams.get("v");
    }

    // /embed/VIDEO_ID, /shorts/VIDEO_ID 등
    const paths = u.pathname.split("/");
    return paths.pop() || paths.pop();
  } catch (e) {
    return null;
  }
}

// YouTube Data API로 영상 정보 가져오기
async function fetchVideoInfo(videoId) {
  const endpoint = "https://www.googleapis.com/youtube/v3/videos";
  const params = new URLSearchParams({
    key: API_KEY,
    part: "snippet",
    id: videoId
  });

  const res = await fetch(`${endpoint}?${params.toString()}`);
  if (!res.ok) throw new Error("YouTube Data API 오류");
  const data = await res.json();

  if (!data.items || data.items.length === 0) {
    throw new Error("영상 정보를 찾을 수 없음");
  }

  const snippet = data.items[0].snippet;
  return {
    title: snippet.title,
    channel: snippet.channelTitle,
    thumbnail:
      (snippet.thumbnails && snippet.thumbnails.high?.url) ||
      snippet.thumbnails.default.url
  };
}

// YouTube Iframe API 준비 콜백 (이름 고정)
function onYouTubeIframeAPIReady() {
  // 지금은 URL 입력 후에만 플레이어를 만들 거라 비워둠
}

// 버튼 클릭 시 실행
document.getElementById("loadButton").addEventListener("click", async () => {
  const url = document.getElementById("videoUrl").value.trim();
  const videoId = extractVideoId(url);

  if (!videoId) {
    alert("유효한 YouTube 주소가 아닌 것 같아요 😢");
    return;
  }

  try {
    // 1) Data API로 메타데이터 가져오기
    const info = await fetchVideoInfo(videoId);
    document.getElementById("title").textContent = info.title;
    document.getElementById("artist").textContent = info.channel;
    document.getElementById("thumbnail").src = info.thumbnail;

    // 2) 플레이어 생성 또는 변경
    if (!player) {
      player = new YT.Player("player", {
        width: "640",
        height: "360",
        videoId: videoId,
        playerVars: {
          rel: 0,
          playsinline: 1
        }
      });
    } else {
      player.loadVideoById(videoId);
    }
  } catch (err) {
    console.error(err);
    alert("영상 정보를 불러오는 중 문제가 발생했어요.");
  }
});
