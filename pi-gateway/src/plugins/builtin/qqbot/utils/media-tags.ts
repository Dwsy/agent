/**
 * 富媒体标签预处理与纠错
 *
 * 小模型常见的标签拼写错误及变体，在发送前统一修正为标准格式。
 *
 * 标准格式：<qqimg>/path/to/file</qqimg>
 */
import { homedir } from "node:os";

// 标准标签名
const VALID_TAGS = ["qqimg", "qqvoice", "qqvideo", "qqfile", "qqmedia"] as const;

// 标签名别名映射
const TAG_ALIASES: Record<string, typeof VALID_TAGS[number]> = {
  // 图片别名
  "qq_img": "qqimg", "qqimage": "qqimg", "qq_image": "qqimg",
  "qqpic": "qqimg", "qq_pic": "qqimg", "qqpicture": "qqimg",
  "img": "qqimg", "image": "qqimg", "pic": "qqimg",
  "picture": "qqimg", "photo": "qqimg",
  // 语音别名
  "qq_voice": "qqvoice", "qqaudio": "qqvoice", "voice": "qqvoice", "audio": "qqvoice",
  // 视频别名
  "qq_video": "qqvideo", "video": "qqvideo",
  // 文件别名
  "qq_file": "qqfile", "qqdoc": "qqfile", "file": "qqfile", "doc": "qqfile",
  // 统一媒体标签
  "qq_media": "qqmedia", "media": "qqmedia", "attachment": "qqmedia",
};

// 所有可识别的标签名（按长度降序避免子串问题）
const ALL_TAG_NAMES = [...VALID_TAGS, ...Object.keys(TAG_ALIASES)].sort((a, b) => b.length - a.length);
const TAG_NAME_PATTERN = ALL_TAG_NAMES.join("|");

/** 自闭合属性语法 → 标准包裹语法 */
const SELF_CLOSING_REGEX = new RegExp(
  "[<＜<]\\s*(" + TAG_NAME_PATTERN + ")" +
  "(?:\\s+(?!file|src|path|url)[a-z_-]+\\s*=\\s*[\"']?[^\"'/>＞>]*?[\"']?)*" +
  "\\s+(?:file|src|path|url)\\s*=\\s*[\"']?([^\"'>＞]+?)[\"']?" +
  "(?:\\s+[a-z_-]+\\s*=\\s*[\"']?[^\"'/>＞>]*?[\"']?)*" +
  "\\s*/?\\s*[>＞>]",
  "gi"
);

/** 畸形/错误标签 → 标准包裹语法 */
const FUZZY_TAG_REGEX = new RegExp(
  "`?[<＜<]\\s*(" + TAG_NAME_PATTERN + ")\\s*[>＞>]" +
  "[\"']?\\s*([^\n<＞>\"'`]+?)\\s*[\"']?" +
  "[<＜<]\\s*/?\\s*(?:" + TAG_NAME_PATTERN + ")\\s*[>＞>]`?",
  "gi"
);

/** 将标签名标准化 */
function resolveTagName(raw: string): typeof VALID_TAGS[number] {
  const lower = raw.toLowerCase();
  if ((VALID_TAGS as readonly string[]).includes(lower)) return lower as typeof VALID_TAGS[number];
  return TAG_ALIASES[lower] ?? "qqimg";
}

/** 展开波浪号路径 */
function expandTilde(p: string): string {
  if (p.startsWith("~/")) return p.replace("~", homedir());
  return p;
}

/**
 * 预处理文本：将各种畸形/错误的富媒体标签修正为标准格式。
 */
export function normalizeMediaTags(text: string): string {
  if (!text) return text;

  // Step 1: 自闭合属性语法 → 标准包裹语法
  // Groups: [1]=tag, [2]=content
  let cleaned = text.replace(SELF_CLOSING_REGEX, (_m, rawTag: string, content: string) => {
    const tag = resolveTagName(rawTag);
    const trimmed = content.trim();
    if (!trimmed) return _m;
    return `<${tag}>${expandTilde(trimmed)}</${tag}>`;
  });

  // Step 2: 畸形标签 → 标准格式
  // Groups: [1]=tag, [2]=content
  cleaned = cleaned.replace(FUZZY_TAG_REGEX, (_m, rawTag: string, content: string) => {
    const tag = resolveTagName(rawTag);
    const trimmed = content.trim();
    if (!trimmed) return _m;
    return `<${tag}>${expandTilde(trimmed)}</${tag}>`;
  });

  return cleaned;
}
