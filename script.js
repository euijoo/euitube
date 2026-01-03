let player = null;

// URL에서 videoId 추출 (아주 단순한 버전)
function extractVideoId(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) {
      return u.pathname.slice(1);
    }
    if (u.searchParams.get("v")) {
      return u.searchParams.get("v");
    }
    // music.youtube.com/embed/VIDEO_ID 같은 형태 대비
    const paths = u.pathname.split("/");
    return paths.pop() || paths.pop();
  } catch (e) {
    return null;
  }
}

// YouTube Iframe API가 준비되면 호출되는 전역 함수 이름 고정
function onYouTubeIframeAPIReady() {
  // 처음에는 빈 상태로 두고, 나중에 videoId를 넣어도 됨
}

// 버튼 클릭 시 실행
document.getElementById("loadButton").addEventListener("click", () => {
  const url = document.getElementById("videoUrl").value.trim();
  const videoId = extractVideoId(url);

  if (!videoId) {
    alert("유효한 YouTube 주소가 아닌 것 같아요 😢");
    return;
  }

  // 썸네일(앨범 커버처럼 사용)
  const thumbUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
  document.getElementById("thumbnail").src = thumbUrl;

  // 간단하게 제목/아티스트 자리에 videoId만 먼저 표기
  // (나중에 Data API나 ytmusicapi 붙여서 진짜 제목/아티스트 가져오면 됨)
  document.getElementById("title").textContent = `Video ID: ${videoId}`;
  document.getElementById("artist").textContent = ``;

  // 플레이어 생성 또는 변경
  if (!player) {
    player = new YT.Player("player", {
      width: "640",
      height: "360",
      videoId: videoId,
      playerVars: {
        // 나중에 controls: 0 등으로 기본 컨트롤 숨기고 커스텀 UI 만들 수 있음
        rel: 0
      }
    });
  } else {
    player.loadVideoById(videoId);
  }
});
