export default {
    fetch(_request) {
        // Cloudflare Pages 静态资源由平台自动处理，
        // Worker 仅作为入口，无需额外逻辑。
        return new Response(null, { status: 404 });
    },
} satisfies ExportedHandler<Env>;
