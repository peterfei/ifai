/**
 * 编码工具 — 编码名规范化 + 扩展名编码推断
 *
 * 纯数据驱动，零过程逻辑。
 * 编码映射表 = 声明式配置，新增编码只需加一行数据。
 */

/** jschardet 检测名 → 统一编码名 */
export const ENCODING_ALIAS: Record<string, string> = {
  'gb2312': 'CP936',
  'gbk': 'CP936',
  'cp936': 'CP936',
  'gb18030': 'CP936',
  'utf-8': 'UTF-8',
  'utf8': 'UTF-8',
  'shift_jis': 'Shift-JIS',
  'shift-jis': 'Shift-JIS',
  'euc-jp': 'EUC-JP',
  'euc-kr': 'EUC-KR',
  'big5': 'Big5',
  'big-5': 'Big5',
  'iso-8859-1': 'ISO-8859-1',
  'iso-8859-2': 'ISO-8859-2',
  'iso-8859-15': 'ISO-8859-15',
  'windows-1252': 'Windows-1252',
  'windows-1251': 'Windows-1251',
};

/** 编码名规范化：一行查表，零分支 */
export const normalizeEncoding = (detected: string): string =>
  ENCODING_ALIAS[detected.toLowerCase()] ?? detected.toUpperCase();

/**
 * 统一编码名 → TextDecoder 编码名
 * TextDecoder 是 Web API，在所有现代浏览器/WebView 中可用，
 * 无需 Node.js Buffer。
 */
export const TEXT_DECODER_ENCODING: Record<string, string> = {
  'UTF-8': 'utf-8',
  'CP936': 'gbk',
  'GB2312': 'gbk',
  'GB18030': 'gb18030',
  'Shift-JIS': 'shift_jis',
  'EUC-JP': 'euc-jp',
  'EUC-KR': 'euc-kr',
  'Big5': 'big5',
  'ISO-8859-1': 'iso-8859-1',
  'ISO-8859-2': 'iso-8859-2',
  'ISO-8859-15': 'iso-8859-15',
  'Windows-1252': 'windows-1252',
  'Windows-1251': 'windows-1251',
};

/** 将统一编码名转为 TextDecoder 可接受的编码名 */
export const toTextDecoderEncoding = (encoding: string): string =>
  TEXT_DECODER_ENCODING[encoding] || encoding.toLowerCase();

/**
 * 扩展名 → 编码推测（jschardet 低置信度时的降级依据）
 * 仅包含高确定性映射，避免误伤 UTF-8 文件。
 */
export const EXT_ENCODING_HINT: Record<string, string> = {
  '.pas': 'CP936',
  '.dpr': 'CP936',
  '.dpk': 'CP936',
  '.dfm': 'CP936',
  '.fmx': 'CP936',
  '.inc': 'CP936',
};

/** 从扩展名获取编码推测 */
export const encodingHintFromPath = (path: string): string | undefined => {
  const dot = path.lastIndexOf('.');
  if (dot === -1) return undefined;
  return EXT_ENCODING_HINT[path.slice(dot).toLowerCase()];
};

/** 编码选择器支持的编码列表（名 → 显示标签） */
export const SUPPORTED_ENCODINGS: { encoding: string; label: string }[] = [
  { encoding: 'UTF-8', label: 'UTF-8' },
  { encoding: 'CP936', label: 'CP936 (GBK)' },
  { encoding: 'GB2312', label: 'GB2312' },
  { encoding: 'GB18030', label: 'GB18030' },
  { encoding: 'Shift-JIS', label: 'Shift-JIS' },
  { encoding: 'EUC-JP', label: 'EUC-JP' },
  { encoding: 'Big5', label: 'Big5' },
  { encoding: 'ISO-8859-1', label: 'ISO-8859-1' },
  { encoding: 'EUC-KR', label: 'EUC-KR' },
  { encoding: 'Windows-1252', label: 'Windows-1252' },
];
