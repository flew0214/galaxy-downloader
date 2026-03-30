/**
 * 抖音视频解析模块
 * 基于 douyinVd 项目的方案：移动端 UA 请求 → 正则提取 → 构造下载URL
 */

import type { UnifiedParseResult } from './types'

const MOBILE_UA =
    'Mozilla/5.0 (Linux; Android 11; SAMSUNG SM-G973U) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/14.2 Chrome/87.0.4280.141 Mobile Safari/537.36'

const PLAY_URL_TEMPLATE =
    'https://www.iesdouyin.com/aweme/v1/play/?video_id=%s&ratio=720p&line=0'

// 正则：提取 play_addr.uri（视频ID）
const VIDEO_URI_PATTERN = /"video":\{"play_addr":\{"uri":"([a-z0-9]+)"/
// 正则：提取 desc（标题）
const DESC_PATTERN = /"desc"\s*:\s*"([^"]*)"/
// 正则：提取 nickname（作者昵称）
const NICKNAME_PATTERN = /"nickname"\s*:\s*"([^"]*)"/
// 正则：提取 aweme_id
const AWEME_ID_PATTERN = /"aweme_id"\s*:\s*"([^"]+)"/
// 正则：提取 cover 封面
const COVER_PATTERN = /"cover"\s*:\s*"([^"]+)"/
// 正则：提取动态封面
const DYNAMIC_COVER_PATTERN = /"dynamic_cover"\s*:\s*\{"uri"\s*:\s*"([^"]+)"/
// 正则：提取 create_time
const CREATE_TIME_PATTERN = /"create_time"\s*:\s*(\d+)/

const DOUYIN_HOSTS = [
    'v.douyin.com',
    'www.douyin.com',
    'douyin.com',
    'iesdouyin.com',
]

/**
 * 检测是否为抖音链接
 */
export function isDouyinUrl(url: string): boolean {
    try {
        const parsed = new URL(url)
        return DOUYIN_HOSTS.some(
            (host) => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`)
        )
    } catch {
        return false
    }
}

/**
 * 从 HTML 响应中提取封面 URL
 */
function extractCoverUrl(body: string): string | null {
    // 优先尝试动态封面
    const dynamicMatch = DYNAMIC_COVER_PATTERN.exec(body)
    if (dynamicMatch?.[1]) {
        const uri = dynamicMatch[1].replace(/\\u002F/g, '/')
        if (uri.startsWith('http')) return uri
        return `https://p3-pc.douyinpic.com/obj/${uri}`
    }

    // 静态封面
    const coverMatch = COVER_PATTERN.exec(body)
    if (coverMatch?.[1]) {
        const url = coverMatch[1].replace(/\\u002F/g, '/')
        if (url.startsWith('http')) return url
        return `https://p3-pc.douyinpic.com/obj/${url}`
    }

    return null
}

/**
 * 解析抖音链接，返回统一格式
 */
export async function parseDouyinUrl(inputUrl: string): Promise<UnifiedParseResult> {
    try {
        // 1. 请求抖音页面（移动端 UA）
        const resp = await fetch(inputUrl, {
            method: 'GET',
            headers: {
                'User-Agent': MOBILE_UA,
                'Referer': 'https://www.douyin.com/',
            },
            redirect: 'follow',
        })

        if (!resp.ok) {
            return {
                success: false,
                code: 'NOT_FOUND',
                error: `抖音页面请求失败: HTTP ${resp.status}`,
            }
        }

        const body = await resp.text()

        // 2. 提取视频 URI
        const uriMatch = VIDEO_URI_PATTERN.exec(body)
        if (!uriMatch?.[1]) {
            // 可能是图文笔记，尝试提取图片
            return parseAsImageNote(body, inputUrl)
        }

        const videoUri = uriMatch[1]
        const downloadVideoUrl = PLAY_URL_TEMPLATE.replace('%s', videoUri)

        // 3. 提取其他元数据
        const descMatch = DESC_PATTERN.exec(body)
        const nicknameMatch = NICKNAME_PATTERN.exec(body)
        const awemeIdMatch = AWEME_ID_PATTERN.exec(body)
        const coverUrl = extractCoverUrl(body)

        const title = descMatch?.[1]?.replace(/\\n/g, ' ').trim() || '抖音视频'
        const author = nicknameMatch?.[1] || ''

        return {
            success: true,
            data: {
                title: author ? `${title} - @${author}` : title,
                desc: descMatch?.[1] || undefined,
                cover: coverUrl,
                platform: 'douyin',
                downloadAudioUrl: null,
                downloadVideoUrl,
                originDownloadVideoUrl: downloadVideoUrl,
                url: inputUrl,
            },
        }
    } catch (err) {
        return {
            success: false,
            code: 'PARSE_FAILED',
            error: `抖音解析失败: ${err instanceof Error ? err.message : String(err)}`,
        }
    }
}

/**
 * 尝试作为图文笔记解析
 */
function parseAsImageNote(body: string, inputUrl: string): UnifiedParseResult {
    // 尝试提取图片 URL 列表
    const imagePattern = /https?:\/\/[^\s"]+douyinpic\.com[^\s"]+/g
    const images: string[] = []
    let match

    while ((match = imagePattern.exec(body)) !== null) {
        const url = match[0].replace(/\\u002F/g, '/')
        if (!images.includes(url) && !url.includes('/obj/')) {
            images.push(url)
        }
    }

    const descMatch = DESC_PATTERN.exec(body)
    const title = descMatch?.[1]?.replace(/\\n/g, ' ').trim() || '抖音图文'

    if (images.length > 0) {
        return {
            success: true,
            data: {
                title,
                cover: images[0],
                platform: 'douyin',
                downloadAudioUrl: null,
                downloadVideoUrl: null,
                originDownloadVideoUrl: null,
                url: inputUrl,
                noteType: 'image',
                images: images.slice(0, 20), // 限制最多20张
            },
        }
    }

    return {
        success: false,
        code: 'PARSE_FAILED',
        error: '无法解析此抖音链接：未找到视频或图片',
    }
}
