export default {
  async fetch(request, env) {
    const input = await request.json().catch(() => ({}));
    return Response.json({ ok: true, echo: input });
  },
};
