import type { DerivedThinkingStep, ThinkingSemanticRole, ThinkingSourceBlock, ThinkingStepsMode } from "./types.js";

// Support English (- * + 1. a.) and Chinese (1、 （一） ①） list markers
const LIST_ITEM_RE = /^\s*(?:[-*+]\s+|\d+[.)]\s+|[a-z][.)]\s+|\d+[、）]\s*|（[一二三四五六七八九十]）\s*|（\d+）\s*|[①②③④⑤⑥⑦⑧⑨⑩]\s*)/i;
const HEADING_RE = /^\s{0,3}#{1,6}\s+/;
// English and Chinese leading filler phrases
const LEADING_SUMMARY_PHRASE_RE =
	/^(?:i\s+(?:need|should|want)\s+to|need\s+to|i(?:'m| am)\s+going\s+to|i(?:'ll| will)|let\s+me|let'?s|first,?\s+|next,?\s+|then,?\s+|now,?\s+|okay,?\s+|我需要?|我应该?|我想要?|我打算?|我会?|我可以?|让我|让我们|首先|第一步|接下来|然后|现在|好的|好的|那么|那|接下来|下一步|接着|之后|最后|最终|总之|总而言之|简单来说|简要地说|总结来说|概括一下)/i;

function normalizeNewlines(text: string): string {
	return text.replace(/\r\n?/g, "\n");
}

function collapseWhitespace(text: string): string {
	return text.replace(/[ \t]+/g, " ").trim();
}

function stripLeadingMarker(text: string): string {
	return text.replace(HEADING_RE, "").replace(LIST_ITEM_RE, "").trim();
}

function stripLeadingSummaryPhrase(text: string): string {
	const stripped = text.replace(LEADING_SUMMARY_PHRASE_RE, "").trim();
	return stripped.length > 0 ? stripped : text.trim();
}

function capitalize(text: string): string {
	if (!text) return text;
	// For Chinese, no case change needed; for English, uppercase first letter
	const firstChar = text.charAt(0);
	// Check if first character is an English letter
	if (/[a-z]/.test(firstChar)) {
		return firstChar.toUpperCase() + text.slice(1);
	}
	return text;
}

function truncateText(text: string, maxLength: number): string {
	if (text.length <= maxLength) return text;
	const truncated = text.slice(0, Math.max(0, maxLength - 1)).trimEnd();
	return `${truncated}…`;
}

function firstMeaningfulLine(text: string): string {
	const lines = normalizeNewlines(text)
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);
	return lines[0] ?? "";
}

function firstSentence(text: string): string {
	const normalized = collapseWhitespace(text);
	if (!normalized) return "";
	// Support both English (.!?) and Chinese (。！？) sentence endings
	const match = normalized.match(/^(.{1,120}?)(?:[.!?。！？](?:\s|$)|$)/);
	return match?.[1]?.trim() ?? normalized;
}

function splitListChunk(chunk: string): string[] {
	const lines = normalizeNewlines(chunk).split("\n");
	const itemLineIndexes = lines.reduce<number[]>((indexes, line, index) => {
		if (LIST_ITEM_RE.test(line)) indexes.push(index);
		return indexes;
	}, []);

	if (itemLineIndexes.length < 2) return [chunk.trim()];

	const items: string[] = [];
	let current: string[] = [];
	for (const line of lines) {
		if (LIST_ITEM_RE.test(line) && current.length > 0) {
			items.push(current.join("\n").trim());
			current = [line];
		} else {
			current.push(line);
		}
	}
	if (current.length > 0) items.push(current.join("\n").trim());
	return items.filter(Boolean);
}

function stripMarkdownEmphasis(text: string): string {
	return text
		.replace(/(\*\*|__)(.+?)\1/g, "$2")
		.replace(/(\*|_)([^*_]+?)\1/g, "$2");
}

function isStandaloneHeadingChunk(chunk: string): boolean {
	const lines = normalizeNewlines(chunk)
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);
	if (lines.length !== 1) return false;

	const line = lines[0]!;
	if (LIST_ITEM_RE.test(line)) return false;
	if (HEADING_RE.test(line)) return true;
	if (!/^(\*\*|__)(.+?)\1$/.test(line)) return false;

	const stripped = stripMarkdownEmphasis(stripLeadingMarker(line));
	return stripped.length > 0 && stripped.length <= 80 && !/[.!?]/.test(stripped);
}

function mergeHeadingParagraphChunks(chunks: string[]): string[] {
	const merged: string[] = [];
	for (let index = 0; index < chunks.length; index += 1) {
		const chunk = chunks[index]!;
		const nextChunk = chunks[index + 1];
		if (nextChunk && isStandaloneHeadingChunk(chunk)) {
			merged.push(`${chunk}\n\n${nextChunk}`);
			index += 1;
			continue;
		}
		merged.push(chunk);
	}
	return merged;
}

function isListParagraphChunk(chunk: string): boolean {
	const firstLine = normalizeNewlines(chunk)
		.split("\n")
		.map((line) => line.trim())
		.find(Boolean);
	return firstLine ? LIST_ITEM_RE.test(firstLine) : false;
}

export function splitThinkingIntoStepTexts(text: string): string[] {
	const normalized = normalizeNewlines(text).trim();
	if (!normalized) return [];

	const paragraphChunks = normalized
		.split(/\n{2,}/)
		.map((chunk) => chunk.trim())
		.filter(Boolean);

	if (paragraphChunks.length === 0) return [];

	const mergedChunks = mergeHeadingParagraphChunks(paragraphChunks);
	const steps: string[] = [];
	for (let index = 0; index < mergedChunks.length; index += 1) {
		const chunk = mergedChunks[index]!;
		const previousStep = steps[steps.length - 1];
		const nextChunk = mergedChunks[index + 1];
		if (previousStep && isListParagraphChunk(previousStep) && !isListParagraphChunk(chunk) && nextChunk && isListParagraphChunk(nextChunk)) {
			steps[steps.length - 1] = `${previousStep}\n\n${chunk}`;
			continue;
		}

		steps.push(...splitListChunk(chunk));
	}
	return steps.length > 0 ? steps : [normalized];
}

export function summarizeThinkingText(text: string, fallback = "推理被提供商隐藏。"): string {
	const SUMMARY_MAX_CHARS = 84;
	const MMR_LAMBDA = 0.7;

	type CandidateKind = "sentence" | "clause" | "bullet" | "heading";
	type Candidate = {
		text: string;
		compressed: string;
		tokens: string[];
		index: number;
		kind: CandidateKind;
		centrality: number;
		positionPrior: number;
		structurePrior: number;
		cuePrior: number;
		score: number;
	};

	const raw = normalizeNewlines(text).trim();
	if (!raw) return fallback;

	const stopwords = new Set([
		"a", "an", "and", "are", "as", "at", "be", "been", "but", "by", "for", "from", "had", "has", "have",
		"i", "if", "in", "into", "is", "it", "its", "just", "let", "me", "my", "now", "of", "on", "or",
		"our", "so", "that", "the", "their", "them", "then", "there", "these", "they", "this", "to", "up",
		"was", "we", "were", "what", "when", "which", "while", "with", "would", "yet", "you",
	]);

	const pureTimestampRe = /^(?:\[)?\d{1,2}:\d{2}(?::\d{2})?(?:\])?$|^\d{4}-\d{2}-\d{2}t\d{2}:\d{2}:\d{2}/i;
	const separatorRe = /^[\s`~!@#$%^&*()_+=\-\[\]{}\|;:'",.<>/?·]+$/;
	const spinnerStatusRe = /^(?:thinking|loading|working|running|processing|waiting|done|complete|completed|idle|思考中|加载中|处理中|等待中|完成|已完成)(?:[ .…:-]+)?$/i;
	// Artifacts: file extensions, function calls, code spans, tools, and Chinese file/function patterns
	const artifactRe = /(?:\b[a-z0-9_-]+\.(?:ts|tsx|js|jsx|json|md|txt|yml|yaml|lock)\b|\b[a-z_][a-z0-9_]*\([^)]*\)|`[^`]+`|\b(?:npm|node|git|pi|larra|mcp|tsx|tsc)\b|\b(?:ts\d{3,5}|err_[a-z0-9_]+)\b|【[^】]+】|「[^」]+」|（[^）]+）\([^)]*\))/i;
	const failureCueRe = /\b(failed|failure|error|errors|blocked|abort(?:ed)?|cannot|unable|did not complete|not completed|reverted|rollback|locked)\b/i;
	const decisionCueRe = /\b(decided|decision|chose|switched|replaced|confirmed|fixed|resolved|discovered|found)\b/i;
	// Action cues: English and Chinese action verbs
	const actionCueRe = /\b(retry|rerun|inspect|check|verify|compare|search|find|read|patch|update|implement|remove|rename|write|run|fix|switch|revert|gather|retrieve|list|flag|review|plan|map|archive|explore|wait|look\s+into)\b|\b(重试|重新运行|检查|查看|检验|审查|扫描|验证|核实|校验|对比|比较|权衡|搜索|查找|寻找|定位|浏览|发现|阅读|读取|打开|修补|更新|升级|实现|执行|移除|删除|重命名|修改|更改|编辑|写入|编写|运行|启动|修复|解决|切换|还原|恢复|撤销|收集|获取|检索|列出|标记|评审|审核|计划|规划|映射|归档|存档|探索|等待|研究|分析|整理|优化|调整|配置|设置|构建|编译|部署|发布|测试|调试|监控|记录|同步|刷新|初始化|清理|查询|订阅|取消|确认|取消|开始|继续|暂停|停止|完成|结束|返回|跳转|导入|导出|上传|下载|复制|粘贴|剪切|移动|创建|生成|转换|计算|排序|过滤|分组|合并|拆分|连接|断开|发送|接收|推送|拉取|提交|合并|变基|回滚|快进|挑选|贮藏|清理|安装|卸载|升级|降级|锁定|解锁|启用|禁用|显示|隐藏|展开|折叠|最大化|最小化|还原|关闭|退出|登录|登出|注册|注销|授权|认证|加密|解密|压缩|解压|编码|解码|签名|验证签名|备份|恢复备份|快照|回退|锁定|解锁|限制|放开|增加|减少|调整|修改|变更|替换|交换|排序|排列|整理|组织|分类|归类|聚合|拆分|分解|解析|理解|明白|了解|知道|掌握|熟悉|学习|研究|调查|考察|勘探|探测|侦查|监测|监控|监督|管理|控制|指挥|指导|引导|带领|推动|促进|加速|减速|减慢|加快|延迟|提前|准时|及时|立刻|立即|马上|赶紧|赶快|尽快|迅速|快速|慢速|缓慢|慢慢|逐步|逐渐|渐渐|慢慢|缓缓|平稳|稳定|固定|确定|肯定|确认|确保|保证|保障|维护|保护|守护|看护|照顾|照料|照看|看管|监视|监管|管控|管制|限制|局限|约束|束缚|限制|限定|规定|规范|规则|规律|规矩|规格|标准|准则|原则|原理|理论|道理|真理|真相|真实|实际|现实|事实|实践|实验|试验|尝试|试图|企图|打算|计划|策划|谋划|规划|部署|安排|布置|配置|安置|安置|安顿|安置|定居|落户|入住|入住|入驻|进驻|进入|退出|离开|离去|离别|分离|分别|分开|分散|散开|聚集|集合|集中|集结|汇总|总结|归纳|概括|概述|简述|简要|简单|简略|扼要|概要|摘要|提要|大纲|提纲|纲领|纲要|要点|重点|重心|核心|中心|中央|中间|当中|之内|之中|之内|以外|之外|以内|以内|以下|以上|之前|之后|以前|以后|从前|今后|将来|未来|过去|曾经|已经|曾经|以往|向来|从来|一直|始终|永远|永久|长久|长期|短期|暂时|临时|偶尔|有时|经常|常常|往往|每每|总是|老是|一直|一贯|一向|从来|原本|本来|原先|原来|本来|原本|其实|实际上|事实上|实际|本来|原来|原先|最初|最早|最先|首先|第一|首要|主要|重要|重大|重点|重视|注重|着重|着力|致力|致力|专注|专心|专门|专业|专家|专科|专长|特色|特点|特征|特性|特色|特有|独特|特殊|特别|尤其|格外|分外|非常|十分|相当|比较|较为|稍微|略微|有点|有些|一些|一点|少许|少量|多量|大量|许多|很多|好多|好多|很多|许多|大量|大批|大宗|大额|小额|少量|微量|巨量|海量|大量|许多|很多|好多|不少|许多|很多|大量|海量|无穷|无限|有限|限度|界限|界线|边缘|边界|边境|边疆|国境|国界|国际|世界|全球|全国|全盘|全面|全体|整体|整个|整体|总体|总体|统一|整合|综合|统筹|协调|协同|协作|合作|配合|协助|辅助|帮助|帮忙|支持|支援|援助|救助|救援|营救|抢救|拯救|挽救|救援|支援|支持|帮助|帮忙|协助|辅助|辅佐|辅助|附属|隶属|归属|属于|归于|归属|隶属|依附|依托|依靠|依赖|凭借|根据|依据|按照|遵照|遵守|遵循|遵从|依照|按照|根据|依据|基于|由于|因为|因此|所以|因而|从而|进而|以致|以至于|结果|成果|效果|成效|结果|结局|结局|结尾|末端|终端|终点|终点|尽头|极限|极端|极度|非常|十分|特别|尤其|格外|分外|很|挺|怪|非常|十分|相当|比较|较为|稍微|略微|有点|有些|一些|一点|少许|少量|多量|大量|许多|很多|好多|不少|诸多|好些|好多|很多|许多|大量|海量|巨量|无限|无穷|无尽|无量|无数|不可计数|不胜枚举|数不胜数|不计其数|不可胜数|恒河沙数|无数|大量|许多|很多|好多|好些|不少|颇多|甚为|颇为|相当|十分|非常|特别|尤其|格外|分外|相当|十分|非常|特别|尤其|格外|分外|极|甚|好|真|太|多么|何等|何等|多么|太|真|好|极|甚|颇|相当|十分|非常|特别|尤其|格外|分外)\b/i;
	const nextActionCueRe = /\b(first|next|retry|rerun|before|after)\b/i;
	const uncertaintyCueRe = /\b(maybe|might|possibly|probably|seems|looks like|suspect|likely|unverified|haven'?t verified|not verified)\b/i;
	const speculativeCueRe = /\b(seems like|could be useful|might be useful|would be useful|considering)\b/i;
	const metaChatterRe = /\b(?:i(?:'m| am)?\s+(?:thinking|contemplating|curious|hoping|wondering)|take a closer look|what makes the most sense|could really help|idealized scenarios|real interactions|worth checking)\b/i;
	const weakFragmentStartRe = /^(?:and|but|or|so|then|though|while|which|because|however|therefore|perhaps|maybe|possibly|also|still|just|since|但是|可是|然而|然后|接着|所以|因此|不过|并且|还有|也许|可能|另外|只是|既然)\b/i;
	// Generic object actions with weak references - English and Chinese
	const genericObjectActionRe = /^(?:flag|review|check|inspect|look\s+into|标记|评审|审核|检查|查看|审查|检验|扫描)\s+(?:that|this|it|这个|那个|这些|那些|它|它们|此|该|这|那|之|其)\b/i;
	// Direct action start patterns - English and Chinese
	const directActionStartRe = /^(?:use|inspect|check|verify|compare|search|find|read|patch|update|implement|remove|rename|write|run|fix|switch|revert|gather|retrieve|list|flag|review|plan|map|archive|explore|wait|look\s+into|使用|查看|检查|检验|审查|扫描|验证|核实|校验|对比|比较|权衡|搜索|查找|寻找|定位|浏览|发现|阅读|读取|打开|修补|更新|升级|实现|执行|移除|删除|重命名|修改|更改|编辑|写入|编写|运行|启动|修复|解决|切换|还原|恢复|撤销|收集|获取|检索|列出|标记|评审|审核|计划|规划|映射|归档|存档|探索|等待|研究|分析|整理|优化|调整|配置|设置|构建|编译|部署|发布|测试|调试|监控|记录|同步|刷新|初始化|清理|查询|确认|开始|继续|暂停|停止|完成|结束|返回|跳转|导入|导出|上传|下载|复制|粘贴|剪切|移动|创建|生成|转换|计算|排序|过滤|分组|合并|拆分|连接|断开|发送|接收|推送|拉取|提交|合并|安装|卸载|启用|禁用|显示|隐藏|展开|折叠|关闭|退出|登录|登出|注册|注销|授权|认证|加密|解密|压缩|解压|编码|解码|备份|恢复|快照|增加|减少|调整|变更|替换|交换|排列|整理|组织|分类|归类|聚合|拆分|分解|解析|理解|研究|调查|探测|监测|监控|监督|管理|控制|指挥|指导|引导|带领|推动|促进|加速|减速|延迟|提前|确认|确保|保证|保障|维护|保护|守护|照顾|照料|监视|监管|管控|限制|约束|限定|规定|规范|规则|标准|准则|原则)\b/i;
	const weakOrientationRe = /\bconnect and orient ourselves\b/i;

	const stripMarkdownEmphasis = (value: string): string =>
		value
			.replace(/(\*\*|__)(.+?)\1/g, "$2")
			.replace(/(\*|_)([^*_]+?)\1/g, "$2");

	const stripBoilerplatePrefix = (value: string): string =>
		value
			.replace(/^\[[^\]]+\]\s*/, "")
			.replace(/^(?:thinking|thoughts?|status|assistant|stdout|stderr|step\s+\d+|progress|delta|思考|想法|状态|助手|步骤|进度|输出|输入)\s*[:>-]\s*/i, "")
			.replace(/^>\s+/, "")
			.replace(/^[-=~]{2,}\s*/, "")
			.trim();

	const isNoiseLine = (value: string): boolean => {
		const normalizedLine = collapseWhitespace(stripBoilerplatePrefix(stripMarkdownEmphasis(value)));
		return !normalizedLine || pureTimestampRe.test(normalizedLine) || separatorRe.test(normalizedLine) || spinnerStatusRe.test(normalizedLine);
	};

	const splitSentences = (value: string): string[] => {
		const dotPlaceholder = "__PI_THINKING_DOT__";
		// Protect file extensions and also Chinese sentence markers that might be inside code/URLs
		const protectedValue = value.replace(/(\b[a-z0-9_-]+)\.(ts|tsx|js|jsx|json|md|txt|yml|yaml|lock)\b/gi, `$1${dotPlaceholder}$2`);
		// Support both English (.!?) and Chinese (。！？) sentence endings
		return (protectedValue.match(/[^.!?。！？\n]+(?:[.!?。！？]+|$)/g) ?? [protectedValue])
			.map((sentence) => sentence.replaceAll(dotPlaceholder, ".").trim())
			.filter(Boolean);
	};

	const splitClauses = (value: string): string[] =>
		value
			// Support both English (;:, but/so/and then) and Chinese (；：， 但是/所以/然后) separators
			.split(/;\s+|:\s+|,\s+|；\s*|：\s*|，\s*|\s+\b(?:but|so|and then|但是|但|所以|因此|然后|接着|接下来)\b\s+/i)
			.map((clause) => clause.trim())
			.filter(Boolean);

	const normalizeCandidateText = (value: string): string =>
		collapseWhitespace(stripBoilerplatePrefix(stripMarkdownEmphasis(stripLeadingMarker(value).replace(/[\u2022]+/g, ""))));

	const compressCandidate = (value: string): string => {
		let candidate = normalizeCandidateText(value)
			.replace(/^(?:it seems like|it looks like|it could be useful to|it might be useful to|it would be useful to|i['’]?m considering|i am considering|how we can|we can)\s*/i, "")
			.replace(/^\b(?:well|okay|now|actually|basically|simply|really)\b[,:]?\s+/i, "")
			.replace(/^(?:i\s+think\s+)?i\s+need\s+to\s+/i, "")
			.replace(/^(?:i\s+think\s+)?i\s+should\s+/i, "")
			.replace(/^i\s+plan\s+to\s+/i, "")
			.replace(/^i\s+(?:will|can)\s+/i, "")
			.replace(/^i\s+(?:want\s+to|am\s+going\s+to|['’]?m\s+going\s+to)\s+/i, "")
			.replace(/^i\s+think\s+the\s+next\s+step\s+(?:might\s+be|is)\s+to\s+/i, "")
			.replace(/^the\s+next\s+step\s+(?:might\s+be|is)\s+to\s+/i, "")
			.replace(/^(?:it(?:'s| is)\s+(?:a\s+good\s+idea|helpful|useful|worthwhile)\s+to)\s+/i, "")
			.replace(/^\b(?:let me|let'?s)\b\s+/i, "")
			.replace(/\s*\(([^()]*)\)\s*/g, " ")
			.replace(/\b(?:for now|at this point)\b/gi, "")
			.replace(/\b(?:could|might|would)\s+be\s+(?:helpful|useful)(?:\s+(?:here|first))?/gi, "")
			.replace(/\bavailable to me\b/gi, "available")
			.replace(/\bfor it\b/gi, "")
			// Chinese boilerplate removal
			.replace(/^(?:让我|让我来|我需要?|我应该?|我打算?|我会?|我可以?|我想要?|我将?|我认为|我觉得|我想|我正在?|我要?|我正在考虑|我们可以?|我们能?)\s*/i, "")
			.replace(/^(?:现在|那么|接下来|首先|然后|接着|之后|最后|总之|所以|因此|不过|但是|可是|然而|并且|另外|还有|其实|实际上|基本上|其实|真的|好像|看起来|似乎|可能|也许|应该|可以|能|会)\s*/i, "")
			.replace(/^(?:这是一个|那是个|这个是|那个是|这有|那有|这样|那样|如何|什么|为什么|谁|哪里|哪个|哪些)\s*/i, "")
			.replace(/^(?:好的|好吧|行|可以|嗯|啊|哦|哈|嗨|喂|对|是的|没错|正确|错误|注意|提醒|警告|建议|提示|注意|重要|关键|核心|主要|基础|基本|简单|容易|困难|复杂|快速|慢速|高效|低效|自动|手动|直接|间接)\s*/i, "")
			.replace(/(?:似乎|好像|看起来|大概|可能|也许|或许|应该|可以|大概|差不多|总体上|整体|一般来说|通常|正常|普通|标准|常规|默认)\s*/gi, "")
			.replace(/(?:对于|关于|有关|涉及|相关|至于|就|按照|根据|基于|通过|使用|利用|借助|依靠|依赖|凭着|随着|由于|因为|所以|因此|于是|因而|从而|进而|以致|以至于|如果|假如|假设|若是|要是|即使|即便|虽然|尽管|虽说|固然|但是|但|可|却|然而|不过|只是|只不过|偏偏|反而|反倒|其实|实际上|事实上|实际上|本来|原本|原先|原来|本来|当然|自然|固然|无疑|肯定|一定|必然|必须|必得|必需|必要|只好|只得|不得不|只能|只得|唯有|只有|仅仅|只是|只不过|刚好|恰巧|恰好|正好|凑巧|碰巧|刚好|可巧|赶巧|不巧|偏偏|偏生|偏巧|偏偏|偏偏)\s*/gi, "")
			.trim();

		candidate = candidate
			.replace(/^using\b/i, "Use")
			.replace(/^inspecting\b/i, "Inspect")
			.replace(/^checking\b/i, "Check")
			.replace(/^comparing\b/i, "Compare")
			.replace(/^verifying\b/i, "Verify")
			.replace(/^searching\b/i, "Search")
			.replace(/^finding\b/i, "Find")
			.replace(/^reviewing\b/i, "Review")
			.replace(/^reading\b/i, "Read")
			.replace(/^writing\b/i, "Write")
			.replace(/^planning\b/i, "Plan")
			.replace(/^mapping out\b/i, "Map out")
			.replace(/^gathering\b/i, "Gather")
			.replace(/^retrieving\b/i, "Retrieve")
			.replace(/^listing\b/i, "List")
			.replace(/^archiving\b/i, "Archive")
			.replace(/^exploring\b/i, "Explore")
			.replace(/^look\s+into\b/i, "Look into")
			.replace(/^connect and orient ourselves\b/i, "Orient to the current state");

		return collapseWhitespace(candidate).replace(/^[,;:.-]+|[,;:.-]+$/g, "").trim();
	};

	const tokenize = (value: string): string[] => {
		const stem = (token: string): string => {
			if (token.length > 5 && token.endsWith("ing")) return token.slice(0, -3);
			if (token.length > 4 && token.endsWith("ed")) return token.slice(0, -2);
			if (token.length > 4 && token.endsWith("es")) return token.slice(0, -2);
			if (token.length > 3 && token.endsWith("s")) return token.slice(0, -1);
			return token;
		};

		const normalized = collapseWhitespace(value).toLowerCase();
		// Split by non-alphanumeric (for English) and also Chinese punctuation/whitespace
		// Keep Chinese characters as individual tokens since they carry meaning
		const tokens: string[] = [];
		const segments = normalized.split(/[^a-z0-9._/\-\u4e00-\u9fa5]+/i);
		
		for (const segment of segments) {
			const trimmed = segment.trim();
			if (!trimmed || trimmed.length <= 1) continue;
			
			// For pure Chinese segments (>=2 chars), keep as token
			if (/^[\u4e00-\u9fa5]{2,}$/.test(trimmed)) {
				tokens.push(trimmed);
				continue;
			}
			
			// For mixed or English, apply stemming and stopword filtering
			const stemmed = stem(trimmed);
			if (stemmed.length > 1 && !stopwords.has(stemmed)) {
				tokens.push(stemmed);
			}
		}
		
		return tokens;
	};

	const extractCandidates = (value: string): Candidate[] => {
		const paragraphs = normalizeNewlines(value).split(/\n{2,}/);
		const candidates: Candidate[] = [];
		const seen = new Set<string>();
		let candidateIndex = 0;

		const pushCandidate = (textValue: string, kind: CandidateKind) => {
			const normalizedText = normalizeCandidateText(textValue);
			if (!normalizedText || separatorRe.test(normalizedText) || seen.has(normalizedText.toLowerCase())) return;
			seen.add(normalizedText.toLowerCase());
			candidates.push({
				text: normalizedText,
				compressed: compressCandidate(normalizedText),
				tokens: tokenize(normalizedText),
				index: candidateIndex++,
				kind,
				centrality: 0,
				positionPrior: 0,
				structurePrior: 0,
				cuePrior: 0,
				score: 0,
			});
		};

		paragraphs.forEach((paragraph) => {
			const rawLines = normalizeNewlines(paragraph).split("\n").map((line) => line.trim()).filter(Boolean);
			const cleanLines = rawLines.filter((line) => !isNoiseLine(line));
			if (cleanLines.length === 0) return;

			const structuredLines = cleanLines.filter((line) => LIST_ITEM_RE.test(line) || HEADING_RE.test(line));
			structuredLines.forEach((line) => pushCandidate(line, HEADING_RE.test(line) ? "heading" : "bullet"));

			const prose = cleanLines.filter((line) => !LIST_ITEM_RE.test(line) && !HEADING_RE.test(line)).join(" " );
			if (!prose) return;
			for (const sentence of splitSentences(prose)) {
				const clauseCandidates = sentence.length > 100 || /[,;:]|\b(?:but|so|and then)\b/i.test(sentence)
					? splitClauses(sentence)
					: [sentence];
				clauseCandidates.forEach((candidate) => pushCandidate(candidate, clauseCandidates.length > 1 ? "clause" : "sentence"));
			}
		});

		return candidates.filter((candidate) => candidate.compressed.length > 0);
	};

	const candidates = extractCandidates(raw);
	if (candidates.length === 0) {
		return truncateText(`${capitalize(collapseWhitespace(stripMarkdownEmphasis(raw))).replace(/[.!?;:,]+$/g, "")}.`, SUMMARY_MAX_CHARS);
	}

	const documentFrequency = new Map<string, number>();
	for (const candidate of candidates) {
		for (const token of new Set(candidate.tokens)) {
			documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1);
		}
	}

	const similarity = (left: Candidate, right: Candidate): number => {
		const leftSet = new Set(left.tokens);
		const rightSet = new Set(right.tokens);
		const union = new Set([...leftSet, ...rightSet]);
		if (union.size === 0) return 0;
		let intersectionWeight = 0;
		let unionWeight = 0;
		for (const token of union) {
			const weight = 1 + Math.log((1 + candidates.length) / (1 + (documentFrequency.get(token) ?? 0)));
			if (leftSet.has(token) && rightSet.has(token)) intersectionWeight += weight;
			unionWeight += weight;
		}
		return unionWeight === 0 ? 0 : intersectionWeight / unionWeight;
	};

	const maxIndex = Math.max(candidates.length - 1, 1);
	const maxCentrality = Math.max(
		...candidates.map((candidate) => {
			if (candidates.length === 1) return 1;
			const total = candidates
				.filter((other) => other !== candidate)
				.reduce((sum, other) => sum + similarity(candidate, other), 0);
			return total / Math.max(candidates.length - 1, 1);
		}),
		1,
	);

	for (const candidate of candidates) {
		const centralityRaw = candidates.length === 1
			? 1
			: candidates
				.filter((other) => other !== candidate)
				.reduce((sum, other) => sum + similarity(candidate, other), 0) / Math.max(candidates.length - 1, 1);
		candidate.centrality = maxCentrality === 0 ? 0 : centralityRaw / maxCentrality;
		candidate.positionPrior = 1 - candidate.index / maxIndex;
		candidate.structurePrior = Math.min(
			1,
			(candidate.kind === "bullet" || candidate.kind === "heading" ? 0.45 : 0)
			+ (artifactRe.test(candidate.text) ? 0.35 : 0)
			+ (failureCueRe.test(candidate.text) ? 0.25 : 0),
		);
		candidate.cuePrior = Math.min(
			1,
			(failureCueRe.test(candidate.text) ? 0.5 : 0)
			+ (decisionCueRe.test(candidate.text) ? 0.35 : 0)
			+ (actionCueRe.test(candidate.compressed) ? 0.6 : 0)
			+ (nextActionCueRe.test(candidate.compressed) ? 0.3 : 0)
			+ (artifactRe.test(candidate.text) ? 0.2 : 0)
			- (metaChatterRe.test(candidate.text) ? 0.45 : 0)
			- (((uncertaintyCueRe.test(candidate.text) || speculativeCueRe.test(candidate.text)) && !failureCueRe.test(candidate.text) && !directActionStartRe.test(candidate.compressed)) ? 0.75 : 0),
		);
		candidate.score = (0.55 * candidate.centrality) + (0.2 * candidate.positionPrior) + (0.15 * candidate.structurePrior) + (0.1 * candidate.cuePrior);

		const hasConcreteCue =
			directActionStartRe.test(candidate.compressed)
			|| failureCueRe.test(candidate.text)
			|| decisionCueRe.test(candidate.text)
			|| artifactRe.test(candidate.text);

		if (directActionStartRe.test(candidate.compressed)) candidate.score += 0.35;
		if (candidate.kind === "heading" && !hasConcreteCue) candidate.score -= 0.45;
		if (metaChatterRe.test(candidate.text) && !hasConcreteCue) candidate.score -= 0.4;
		if (weakFragmentStartRe.test(candidate.compressed) && !hasConcreteCue) candidate.score -= 0.9;
		if ((/^not\b/i.test(candidate.compressed) || candidate.tokens.length < 4) && candidate.kind === "clause" && !hasConcreteCue) candidate.score -= 0.75;
		if (genericObjectActionRe.test(candidate.compressed) && !artifactRe.test(candidate.text)) candidate.score -= 0.8;
		if (weakOrientationRe.test(candidate.compressed) && !artifactRe.test(candidate.compressed)) candidate.score -= 0.6;
	}

	const formatSummarySentence = (clauses: string[]): string => {
		const normalizedClauses = clauses
			.map((candidate) => candidate.replace(/[.!?;:,]+$/g, "").trim())
			.filter(Boolean)
			.filter((clause, index) => index === 0 || !weakFragmentStartRe.test(clause));
		if (normalizedClauses.length === 0) return fallback;
		const [firstClause, ...restClauses] = normalizedClauses;
		let sentence = capitalize(firstClause);
		if (restClauses.length > 0) {
			const normalizedRest = restClauses.map((clause) => {
				if (/^[A-Z][a-z]/.test(clause)) return clause.charAt(0).toLowerCase() + clause.slice(1);
				return clause;
			});
			sentence = `${sentence}, then ${normalizedRest.join(", then ")}`;
		}
		return `${sentence.replace(/[.!?;:,]+$/g, "")}.`;
	};

	const selected: Candidate[] = [];
	const directActionCandidates = candidates.filter((candidate) => directActionStartRe.test(candidate.compressed));
	const prioritizedPool = directActionCandidates.length > 0
		? candidates.filter((candidate) => !genericObjectActionRe.test(candidate.compressed) && (directActionStartRe.test(candidate.compressed) || failureCueRe.test(candidate.text) || decisionCueRe.test(candidate.text) || (uncertaintyCueRe.test(candidate.text) && !weakFragmentStartRe.test(candidate.compressed) && !(candidate.kind === "clause" && candidate.tokens.length < 4))))
		: candidates;
	const remaining = [...prioritizedPool];

	while (remaining.length > 0 && selected.length < 2) {
		remaining.sort((left, right) => {
			const leftPenalty = selected.length === 0 ? 0 : Math.max(...selected.map((candidate) => similarity(left, candidate)));
			const rightPenalty = selected.length === 0 ? 0 : Math.max(...selected.map((candidate) => similarity(right, candidate)));
			const leftScore = (MMR_LAMBDA * left.score) - ((1 - MMR_LAMBDA) * leftPenalty);
			const rightScore = (MMR_LAMBDA * right.score) - ((1 - MMR_LAMBDA) * rightPenalty);
			return rightScore - leftScore || left.index - right.index;
		});

		const next = remaining.shift()!;
		const ordered = [...selected, next].sort((left, right) => left.index - right.index);
		if (formatSummarySentence(ordered.map((candidate) => candidate.compressed)).length <= SUMMARY_MAX_CHARS || selected.length === 0) {
			selected.push(next);
		}
	}

	const fallbackPool = prioritizedPool.length > 0 ? prioritizedPool : candidates;
	const orderedSelection = (selected.length > 0 ? selected : [fallbackPool.sort((left, right) => right.score - left.score || left.index - right.index)[0]!])
		.sort((left, right) => left.index - right.index);
	return truncateText(formatSummarySentence(orderedSelection.map((candidate) => candidate.compressed)) || fallback, SUMMARY_MAX_CHARS);
}

export function inferThinkingRole(text: string): ThinkingSemanticRole {
	const haystack = ` ${normalizeNewlines(text).toLowerCase()} `;
	const scoredRoles: Array<{ role: ThinkingSemanticRole; score: number }> = [
		{
			role: "error",
			score:
				(Number(/\b(error|errors|fail|failure|exception|bug|issue|problem|warning|debug|stack trace|traceback|错误|失败|异常|故障|问题|警告|调试)\b/.test(haystack)) * 4) +
				(Number(/\b(fix|修复|解决)\b/.test(haystack)) * 2),
		},
		{
			role: "compare",
			score:
				(Number(/\b(compare|comparison|versus|\bvs\b|trade-?off|alternative|option|weigh|choose between|比较|对比|权衡|选择|替代)\b/.test(haystack)) * 4),
		},
		{
			role: "search",
			score:
				(Number(/\b(search|grep|find|locate|lookup|browse|discover|搜索|查找|定位|浏览|发现)\b/.test(haystack)) * 3) +
				(Number(/\b(list|describe|列出|描述)\b(?=.*\b(tools?|工具)\b)/.test(haystack)) * 2),
		},
		{
			role: "inspect",
			score:
				(Number(/\b(inspect|examine|read|open|scan|review|trace|look at|understand|orient|connection|查看|检查|阅读|打开|扫描|审查|追踪|分析|理解)\b/.test(haystack)) * 3) +
				(Number(/\b(connect|连接)\b/.test(haystack)) * 2),
		},
		{
			role: "plan",
			score:
				(Number(/\b(plan|planning|approach|strategy|outline|decide|figure out|map out|organize|break down|计划|规划|策略|大纲|决定|分解|组织)\b/.test(haystack)) * 3),
		},
		{
			role: "write",
			score:
				(Number(/\b(write|implement|patch|update|refactor|create|add|remove|rename|modify|编写|实现|补丁|更新|重构|创建|添加|删除|重命名|修改|写入)\b/.test(haystack)) * 3) +
				(Number(/\b(edit|编辑)\b/.test(haystack)) * 2),
		},
		{
			role: "verify",
			score:
				(Number(/\b(verify|verification|validate|validation|recheck|prove|验证|校验|确认|核实|证明)\b/.test(haystack)) * 4) +
				(Number(/\b(test|confirm|测试|确认)\b/.test(haystack)) * 2) +
				(Number(/\b(check|ensure|检查|确保)\b/.test(haystack)) * 1),
		},
	];

	const bestRole = scoredRoles
		.sort((a, b) => b.score - a.score)
		.find((entry) => entry.score > 0);

	return bestRole?.role ?? "default";
}

export function iconForThinkingRole(role: ThinkingSemanticRole): string {
	switch (role) {
		case "inspect":
			return "◫";
		case "plan":
			return "◇";
		case "compare":
			return "↔";
		case "verify":
			return "✓";
		case "write":
			return "✎";
		case "search":
			return "⌕";
		case "error":
			return "!";
		default:
			return "·";
	}
}

export function deriveThinkingSteps(blocks: ThinkingSourceBlock[]): DerivedThinkingStep[] {
	const steps: DerivedThinkingStep[] = [];
	blocks.forEach((block, blockIndex) => {
		if (block.redacted && !block.text.trim()) {
			const summary = "推理内容被提供商隐藏。";
			steps.push({
				id: `${block.contentIndex}-0`,
				contentIndex: block.contentIndex,
				blockIndex,
				stepIndex: 0,
				summary,
				body: summary,
				role: "default",
				icon: iconForThinkingRole("default"),
			});
			return;
		}

		const stepTexts = splitThinkingIntoStepTexts(block.text);
		stepTexts.forEach((stepText, stepIndex) => {
			const summary = summarizeThinkingText(stepText);
			const role = inferThinkingRole(`${summary}\n${stepText}`);
			steps.push({
				id: `${block.contentIndex}-${stepIndex}`,
				contentIndex: block.contentIndex,
				blockIndex,
				stepIndex,
				summary,
				body: stepText.trim(),
				role,
				icon: iconForThinkingRole(role),
			});
		});
	});
	return steps;
}

export function parseThinkingMode(input: string): ThinkingStepsMode | undefined {
	const normalized = input.trim().toLowerCase();
	if (!normalized) return undefined;
	if (["collapsed", "collapse", "c"].includes(normalized)) return "collapsed";
	if (["summary", "summaries", "s"].includes(normalized)) return "summary";
	if (["expanded", "expand", "full", "e"].includes(normalized)) return "expanded";
	return undefined;
}
