export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const fileName = url.searchParams.get("name");

    // CORS 설정
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, PUT, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "*",
        },
      });
    }

    if (request.method === "PUT" && fileName) {
      // 업로드된 파일의 실제 Content-Type을 그대로 저장 (안 넘기면 R2가
      // application/octet-stream으로 저장해서 이미지/SVG가 제대로 안 열릴 수 있음)
      const contentType = request.headers.get("Content-Type") || "application/octet-stream";

      await env.MY_BUCKET.put(fileName, request.body, {
        httpMetadata: { contentType },
      });

      // pub-....r2.dev 로 바로 연결하던 걸, 이 워커 자신을 거치는 주소로 바꿈
      // — 그래야 다운로드(GET) 시에도 아래 CORS 헤더가 확실히 적용됨
      return new Response(JSON.stringify({
        url: `${url.origin}/?name=${encodeURIComponent(fileName)}`
      }), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        }
      });
    }

    // 다운로드(읽기)도 이 워커가 직접 처리 — R2에서 파일을 꺼내서
    // CORS 헤더를 확실히 붙인 채로 내려줌.
    if (request.method === "GET" && fileName) {
      const object = await env.MY_BUCKET.get(fileName);
      if (!object) {
        return new Response("파일을 찾을 수 없습니다.", { status: 404 });
      }

      const headers = new Headers();
      object.writeHttpMetadata(headers); // 저장해둔 Content-Type 등을 그대로 실어줌
      headers.set("etag", object.httpEtag);
      headers.set("Access-Control-Allow-Origin", "*");

      return new Response(object.body, { headers });
    }

    // [추가] 실제 파일 삭제 — 관리자 페이지의 "30일 지난 파일 삭제" 버튼에서 호출됨
    if (request.method === "DELETE" && fileName) {
      await env.MY_BUCKET.delete(fileName);
      return new Response(JSON.stringify({ success: true }), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        }
      });
    }

    return new Response("Method not allowed", { status: 405 });
  }
}
