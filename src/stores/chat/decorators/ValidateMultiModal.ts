/**
 * 📜 多模态验证装饰器（元编程）
 *
 * 核心功能：
 * - 自动验证多模态内容格式
 * - 零侵入验证逻辑
 * - 类型安全保证
 * - 错误提示友好
 *
 * @module ValidateMultiModal
 */

/**
 * 内容部分类型
 */
type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

/**
 * 多模态内容类型
 */
type MultiModalContent = ContentPart[];

/**
 * 验证多模态内容格式
 *
 * @param content 待验证的内容
 * @returns 是否为有效的多模态内容
 */
export function validateMultiModalContent(content: any): content is MultiModalContent {
  // 必须是数组
  if (!Array.isArray(content)) {
    return false;
  }

  // 不能为空
  if (content.length === 0) {
    return false;
  }

  // 验证每个部分
  for (const part of content) {
    // 必须有 type 字段
    if (!part || typeof part !== 'object') {
      return false;
    }

    if (!part.type) {
      return false;
    }

    // 验证文本类型
    if (part.type === 'text') {
      if (typeof part.text !== 'string') {
        return false;
      }
    }
    // 验证图片类型
    else if (part.type === 'image_url') {
      if (!part.image_url?.url) {
        return false;
      }

      if (!isValidImageURL(part.image_url.url)) {
        return false;
      }
    }
    // 未知类型
    else {
      return false;
    }
  }

  return true;
}

/**
 * 验证图片 URL 格式
 *
 * @param url 图片 URL
 * @returns 是否为有效的图片 URL
 */
function isValidImageURL(url: string): boolean {
  if (typeof url !== 'string') {
    return false;
  }

  // 支持 base64 格式
  if (url.startsWith('data:image/')) {
    const base64Match = url.match(/^data:image\/(\w+);base64,/);
    return !!base64Match;
  }

  // 支持 HTTPS URL
  if (url.startsWith('https://')) {
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    return imageExtensions.some(ext => url.toLowerCase().includes(ext));
  }

  return false;
}

/**
 * 多模态验证装饰器
 *
 * @example
 * ```typescript
 * class MyClass {
 *   @ValidateMultiModal
 *   myMethod(data: { multiModalContent?: MultiModalContent }) {
 *     // multiModalContent 已经验证
 *   }
 * }
 * ```
 */
export function ValidateMultiModal(
  target: any,
  propertyKey: string,
  descriptor: PropertyDescriptor
): PropertyDescriptor {
  const originalMethod = descriptor.value;

  descriptor.value = function (this: any, ...args: any[]) {
    // 验证第一个参数是否包含有效的 multiModalContent
    const data = args[0];

    if (data && typeof data === 'object' && 'multiModalContent' in data) {
      const multiModalContent = data.multiModalContent;

      // 如果 multiModalContent 存在，验证其格式
      if (multiModalContent !== undefined && multiModalContent !== null) {
        const isValid = validateMultiModalContent(multiModalContent);

        if (!isValid) {
          const className = target.constructor?.name || 'Unknown';
          console.error(
            `[ValidateMultiModal] ❌ Invalid multiModalContent in ${className}.${propertyKey}:`,
            {
              hasMultiModalContent: true,
              contentType: Array.isArray(multiModalContent) ? 'array' : typeof multiModalContent,
              itemCount: Array.isArray(multiModalContent) ? multiModalContent.length : 0,
              value: multiModalContent,
            }
          );

          throw new Error(
            `Invalid multiModalContent format in ${className}.${propertyKey}. ` +
            `Expected an array of ContentPart objects with 'type' field.`
          );
        }

        // 验证通过，记录日志
        console.log(
          `[ValidateMultiModal] ✅ Valid multiModalContent in ${target.constructor?.name}.${propertyKey}:`,
          {
            itemCount: multiModalContent.length,
            types: multiModalContent.map((c: any) => c.type),
          }
        );
      }
    }

    // 执行原方法
    return originalMethod.apply(this, args);
  };

  return descriptor;
}
