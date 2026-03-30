import { NextRequest, NextResponse } from "next/server"
import { isDouyinUrl, parseDouyinUrl } from "@/lib/douyin-parser"

const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:8080"

const FORWARDED_REQUEST_HEADERS = [
    "accept",
    "content-type",
    "range",
] as const

function buildUpstreamUrl(pathSegments: string[], request: NextRequest): URL {
    const upstream = new URL(`/api/${pathSegments.join("/")}`, API_BASE_URL)
    upstream.search = request.nextUrl.search
    return upstream
}

function buildUpstreamHeaders(request: NextRequest): Headers {
    const headers = new Headers()

    for (const headerName of FORWARDED_REQUEST_HEADERS) {
        const value = request.headers.get(headerName)
        if (value) {
            headers.set(headerName, value)
        }
    }

    return headers
}

function addCorsHeaders(headers: Headers): void {
    headers.set("Access-Control-Allow-Origin", "*")
    headers.set("Access-Control-Allow-Methods", "GET, OPTIONS")
    headers.set("Access-Control-Allow-Headers", "Content-Type")
}

/**
 * 检查请求是否为抖音解析，如果是则本地处理
 */
async function handleLocalDouyinParse(
    request: NextRequest,
    pathSegments: string[]
): Promise<Response | null> {
    // 只处理 /parse 请求
    if (pathSegments.join("/") !== "parse") {
        return null
    }

    const targetUrl = request.nextUrl.searchParams.get("url")
    if (!targetUrl || !isDouyinUrl(targetUrl)) {
        return null
    }

    // 本地解析抖音链接
    const result = await parseDouyinUrl(targetUrl)
    const headers = new Headers()
    addCorsHeaders(headers)
    headers.set("Content-Type", "application/json")

    return new NextResponse(JSON.stringify(result), {
        status: result.success ? 200 : (result.status ?? 500),
        headers,
    })
}

async function proxyRequest(
    request: NextRequest,
    context: { params: Promise<{ path: string[] }> }
): Promise<Response> {
    const { path } = await context.params

    // CORS preflight
    if (request.method === "OPTIONS") {
        const headers = new Headers()
        addCorsHeaders(headers)
        return new NextResponse(null, { status: 204, headers })
    }

    // 尝试本地处理抖音解析
    const localResponse = await handleLocalDouyinParse(request, path)
    if (localResponse) {
        return localResponse
    }

    // 其他请求代理到后端
    const upstreamUrl = buildUpstreamUrl(path, request)
    const method = request.method
    const headers = buildUpstreamHeaders(request)

    const upstreamResponse = await fetch(upstreamUrl, {
        method,
        headers,
        body: method === "GET" || method === "HEAD" ? undefined : request.body,
        duplex: method === "GET" || method === "HEAD" ? undefined : "half",
        redirect: "follow",
        cache: "no-store",
    })

    const responseHeaders = new Headers()
    addCorsHeaders(responseHeaders)
    for (const [key, value] of upstreamResponse.headers) {
        if (key.toLowerCase() === "content-encoding") continue
        if (key.toLowerCase() === "transfer-encoding") continue
        responseHeaders.set(key, value)
    }

    return new NextResponse(upstreamResponse.body, {
        status: upstreamResponse.status,
        statusText: upstreamResponse.statusText,
        headers: responseHeaders,
    })
}

export const GET = proxyRequest
export const POST = proxyRequest
export const PUT = proxyRequest
export const PATCH = proxyRequest
export const DELETE = proxyRequest
export const OPTIONS = proxyRequest
export const HEAD = proxyRequest
