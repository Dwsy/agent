# Vision 视觉分析代理使用指南

## 📖 简介

Vision 代理是一个专业的视觉分析代理，基于 **Qwen3-VL-235B-A22B-Instruct** 模型，提供强大的图像、视频分析能力。

### 核心特性

- 🎯 **多模态理解**：图像、视频、文本联合理解
- 🔍 **OCR 文本提取**：支持 33 种语言的文字识别
- 📊 **数据可视化分析**：图表、仪表盘解读
- 🎨 **UI/UX 分析**：界面设计评估与建议
- 🏗️ **技术图表解析**：架构图、流程图、UML 等
- 🎬 **视频内容分析**：动作识别、事件检测、摘要生成
- 📄 **PDF 文档处理**：将 PDF 转换为图片后进行内容提取和分析

---

## 🚀 快速开始

### 基础使用

```bash
# 调用视觉代理分析图像
请分析这张图片：/path/to/image.jpg
```

### 依赖安装

```bash
# 基础依赖
pip install requests pillow

# PDF 处理依赖
pip install pdf2image

# 视频处理依赖（可选）
pip install opencv-python

# 系统依赖：安装 poppler（PDF 转换必需）

# macOS
brew install poppler

# Linux (Ubuntu/Debian)
sudo apt-get install poppler-utils

# Linux (CentOS/RHEL)
sudo yum install poppler-utils

# Windows
# 从 https://github.com/oschwartz10612/poppler-windows/releases/ 下载
# 解压后将 bin 目录添加到 PATH 环境变量
```

### Python 集成示例

```python
import requests
import base64

def analyze_image(image_path, prompt):
    """使用 Vision 代理分析图像"""
    with open(image_path, "rb") as f:
        image_data = base64.b64encode(f.read()).decode('utf-8')

    response = requests.post(
        "http://localhost:8000/v1/chat/completions",
        json={
            "model": "Qwen/Qwen3-VL-235B-A22B-Instruct",
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{image_data}"}},
                        {"type": "text", "text": prompt}
                    ]
                }
            ],
            "temperature": 0.7,
            "max_tokens": 2048
        }
    )
    return response.json()['choices'][0]['message']['content']

# 使用示例
result = analyze_image("screenshot.png", "请描述这个 UI 界面的主要功能")
print(result)
```

---

## 🎯 核心能力详解

### 1. 图像理解与分析

**适用场景**：
- 图像内容描述
- 物体识别与分类
- 场景理解
- 情感分析

**示例**：
```python
prompt = "请详细描述这张图片的内容，包括：人物、环境、动作、情感等"
result = analyze_image("photo.jpg", prompt)
```

### 2. OCR 文本提取

**适用场景**：
- 扫描件文字识别
- 票据信息提取
- 证件信息抽取
- 表格数据提取

**示例**：
```python
prompt = """请提取图片中的所有文本信息，并以 JSON 格式输出：
{
  "text": "完整文本内容",
  "fields": {
    "字段名": "字段值"
  }
}"""
result = analyze_image("invoice.jpg", prompt)
```

**支持语言**：中文、英文、日文、韩文、阿拉伯文等 33 种语言

### 3. UI/UX 设计分析

**适用场景**：
- 界面布局评估
- 用户体验分析
- 设计规范检查
- 改进建议生成

**示例**：
```python
prompt = """请分析这个 UI 界面：
1. 整体布局结构（如：顶部导航、侧边栏、内容区）
2. 主要功能组件
3. 设计风格和色彩方案
4. 用户体验评价（优缺点）
5. 具体的改进建议"""
result = analyze_image("app-screenshot.png", prompt)
```

### 4. 技术图表解析

**适用场景**：
- 系统架构图
- 流程图
- UML 类图/时序图
- ER 图
- 网络拓扑图

**示例**：
```python
prompt = """请分析这个技术图表：
1. 图表类型
2. 主要组成元素及其作用
3. 元素之间的逻辑关系
4. 数据流向
5. 关键设计模式"""
result = analyze_image("architecture.png", prompt)
```

### 5. 数据可视化分析

**适用场景**：
- 折线图、柱状图、饼图
- 散点图、雷达图
- 仪表盘、热力图
- 复杂组合图表

**示例**：
```python
prompt = """请分析这个数据图表：
1. 图表类型
2. 显示的数据维度和指标
3. 主要趋势和模式
4. 异常点或关键转折点
5. 业务洞察和建议"""
result = analyze_image("chart.png", prompt)
```

### 6. 视频内容分析

**适用场景**：
- 动作识别
- 事件检测
- 视频摘要
- 行为分析

**示例**：
```python
import cv2

def analyze_video(video_path, frame_count=10):
    """分析视频内容"""
    cap = cv2.VideoCapture(video_path)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    interval = total_frames // frame_count

    frames = []
    for i in range(frame_count):
        frame_num = i * interval
        cap.set(cv2.CAP_PROP_POS_FRAMES, frame_num)
        ret, frame = cap.read()
        if ret:
            _, buffer = cv2.imencode('.jpg', frame)
            frames.append(base64.b64encode(buffer).decode('utf-8'))

    cap.release()

    # 构建多帧分析请求
    content = [{"type": "video", "video": frames, "fps": interval}]
    content.append({"type": "text", "text": "请描述视频中的主要动作和事件"})

    response = requests.post(
        "http://localhost:8000/v1/chat/completions",
        json={
            "model": "Qwen/Qwen3-VL-235B-A22B-Instruct",
            "messages": [{"role": "user", "content": content}]
        }
    )
    return response.json()

result = analyze_video("demo.mp4")
```

### 7. PDF 文档分析

**适用场景**：
- 文档内容提取
- 表格数据提取
- 合同/发票信息识别
- 学术论文分析
- 技术文档处理

**示例**：
```python
import pdf2image
from io import BytesIO
from PIL import Image

def pdf_to_images(pdf_path, dpi=200):
    """将 PDF 转换为图片列表"""
    images = pdf2image.convert_from_path(pdf_path, dpi=dpi)

    image_list = []
    for img in images:
        buffered = BytesIO()
        img.save(buffered, format="JPEG", quality=90)
        image_data = base64.b64encode(buffered.getvalue()).decode('utf-8')
        image_list.append(image_data)

    return image_list

def analyze_pdf(pdf_path, prompt=None):
    """分析 PDF 文档"""
    # 将 PDF 转换为图片
    image_list = pdf_to_images(pdf_path)

    if prompt is None:
        prompt = """请分析这个 PDF 文档：
1. 文档标题和类型
2. 主要章节和结构
3. 关键内容和信息
4. 表格和图表的摘要
5. 重要结论或要点"""

    # 构建多图像输入
    content = []
    for image_data in image_list:
        content.append({
            "type": "image_url",
            "image_url": {"url": f"data:image/jpeg;base64,{image_data}"}
        })

    content.append({"type": "text", "text": prompt})

    response = requests.post(
        "http://localhost:8000/v1/chat/completions",
        json={
            "model": "Qwen/Qwen3-VL-235B-A22B-Instruct",
            "messages": [{"role": "user", "content": content}]
        }
    )
    return response.json()

# 使用示例
result = analyze_pdf("document.pdf")
print(result['choices'][0]['message']['content'])
```

---

## 📝 高级用法

### 多图像对比

```python
def compare_images(image_paths):
    """对比多张图像"""
    content = []
    for path in image_paths:
        with open(path, "rb") as f:
            image_data = base64.b64encode(f.read()).decode('utf-8')
        content.append({"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{image_data}"}})
    
    content.append({"type": "text", "text": "请对比这些图像的差异和相似之处"})
    
    response = requests.post(
        "http://localhost:8000/v1/chat/completions",
        json={
            "model": "Qwen/Qwen3-VL-235B-A22B-Instruct",
            "messages": [{"role": "user", "content": content}]
        }
    )
    return response.json()

# 使用示例
result = compare_images(["design-v1.png", "design-v2.png"])
```

### 高分辨率图像处理

```python
def analyze_high_res_image(image_path, max_pixels=2621440):
    """分析高分辨率图像"""
    with open(image_path, "rb") as f:
        image_data = base64.b64encode(f.read()).decode('utf-8')
    
    response = requests.post(
        "http://localhost:8000/v1/chat/completions",
        json={
            "model": "Qwen/Qwen3-VL-235B-A22B-Instruct",
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{image_data}"}},
                        {"type": "text", "text": "请详细分析图像中的所有细节"}
                    ]
                }
            ],
            "extra_body": {
                "max_pixels": max_pixels,
                "vl_high_resolution_images": False
            }
        }
    )
    return response.json()

# 使用示例
result = analyze_high_res_image("4k-image.png", max_pixels=16777216)
```

### 结构化输出

```python
def structured_analysis(image_path):
    """获取结构化分析结果"""
    prompt = """请分析图像并以 JSON 格式输出：
{
  "summary": "简要描述",
  "objects": [
    {"name": "物体名称", "confidence": 0.95, "bbox": [x, y, w, h]}
  ],
  "text_content": "识别的文本",
  "attributes": {
    "color": "主色调",
    "style": "风格",
    "mood": "情感"
  }
}"""

    response = requests.post(
        "http://localhost:8000/v1/chat/completions",
        json={
            "model": "Qwen/Qwen3-VL-235B-A22B-Instruct",
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{image_data}"}},
                        {"type": "text", "text": prompt}
                    ]
                }
            ]
        }
    )
    return response.json()
```

### PDF 文档分页分析

```python
def analyze_pdf_by_page(pdf_path, pages=None):
    """按页分析 PDF 文档"""
    images = pdf2image.convert_from_path(pdf_path, dpi=200)

    if pages is None:
        pages = range(1, len(images) + 1)

    results = {}

    for page_num, img in zip(pages, images):
        buffered = BytesIO()
        img.save(buffered, format="JPEG", quality=90)
        image_data = base64.b64encode(buffered.getvalue()).decode('utf-8')

        response = requests.post(
            "http://localhost:8000/v1/chat/completions",
            json={
                "model": "Qwen/Qwen3-VL-235B-A22B-Instruct",
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{image_data}"}},
                            {"type": "text", "text": f"分析第 {page_num} 页的内容"}
                        ]
                    }
                ]
            }
        )

        results[f"page_{page_num}"] = response.json()['choices'][0]['message']['content']

    return results
```

---

## ⚙️ 配置选项

### API 参数

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `temperature` | float | 0.7 | 控制输出随机性（0-2） |
| `max_tokens` | int | 2048 | 最大输出 Token 数 |
| `top_p` | float | 0.8 | 核采样参数 |
| `max_pixels` | int | 2621440 | 最大像素数（高分辨率图像） |
| `vl_high_resolution_images` | bool | false | 启用高分辨率模式 |

### 思考模式（Thinking Mode）

```python
response = requests.post(
    "http://localhost:8000/v1/chat/completions",
    json={
        "model": "qwen3-vl-plus",
        "messages": [...],
        "extra_body": {
            "enable_thinking": True,
            "thinking_budget": 81920
        }
    }
)
```

---

## 🎨 使用场景示例

### 场景 1：产品界面测试

```python
def test_product_ui(screenshot_path):
    """自动化 UI 测试"""
    prompt = """请作为 QA 工程师分析这个产品界面：
1. 检查所有可交互元素是否正常显示
2. 识别潜在的 UI 缺陷
3. 检查布局是否符合设计规范
4. 评估可访问性
5. 列出所有需要修复的问题"""
    
    result = analyze_image(screenshot_path, prompt)
    return result
```

### 场景 2：发票信息提取

```python
def extract_invoice_info(invoice_path):
    """提取发票信息"""
    prompt = """请提取发票信息并以 JSON 格式输出：
{
  "invoice_code": "发票代码",
  "invoice_number": "发票号码",
  "date": "开票日期",
  "amount": "金额",
  "seller": "销售方",
  "buyer": "购买方",
  "items": [
    {"name": "商品名称", "quantity": 1, "price": 100.00}
  ]
}"""
    
    return analyze_image(invoice_path, prompt)
```

### 场景 3：代码截图转代码

```python
def code_from_screenshot(screenshot_path):
    """将代码截图转换为可执行代码"""
    prompt = """请识别图片中的代码，并提供：
1. 编程语言
2. 完整的代码（保持原有格式）
3. 代码功能说明
4. 可能存在的问题或改进建议"""
    
    return analyze_image(screenshot_path, prompt)
```

### 场景 4：文档 OCR 与结构化

```python
def document_ocr(doc_path):
    """文档 OCR 与结构化"""
    prompt = """请识别文档内容并结构化输出：
{
  "title": "文档标题",
  "sections": [
    {"heading": "标题", "content": "内容"}
  ],
  "tables": [...],
  "key_points": ["要点1", "要点2"]
}"""

    return analyze_image(doc_path, prompt)
```

### 场景 5：PDF 文档分析

```python
import pdf2image
import base64
from io import BytesIO
from PIL import Image

def pdf_to_images(pdf_path, dpi=200):
    """将 PDF 转换为图片列表"""
    # 转换 PDF 为图片
    images = pdf2image.convert_from_path(pdf_path, dpi=dpi)

    image_list = []
    for img in images:
        # 将 PIL Image 转换为 base64
        buffered = BytesIO()
        img.save(buffered, format="JPEG", quality=90)
        image_data = base64.b64encode(buffered.getvalue()).decode('utf-8')
        image_list.append(image_data)

    return image_list

def analyze_pdf(pdf_path, prompt=None):
    """分析 PDF 文档"""
    # 将 PDF 转换为图片
    image_list = pdf_to_images(pdf_path)

    if prompt is None:
        prompt = """请分析这个 PDF 文档：
1. 文档标题和类型
2. 主要章节和结构
3. 关键内容和信息
4. 表格和图表的摘要
5. 重要结论或要点"""

    # 构建多图像输入
    content = []
    for image_data in image_list:
        content.append({
            "type": "image_url",
            "image_url": {"url": f"data:image/jpeg;base64,{image_data}"}
        })

    content.append({"type": "text", "text": prompt})

    response = requests.post(
        "http://localhost:8000/v1/chat/completions",
        json={
            "model": "Qwen/Qwen3-VL-235B-A22B-Instruct",
            "messages": [{"role": "user", "content": content}]
        }
    )
    return response.json()

# 使用示例
result = analyze_pdf("document.pdf")
print(result['choices'][0]['message']['content'])
```

### 场景 6：PDF 信息提取

```python
def extract_pdf_info(pdf_path):
    """提取 PDF 中的结构化信息"""
    image_list = pdf_to_images(pdf_path)

    prompt = """请提取 PDF 文档中的信息并以 JSON 格式输出：
{
  "title": "文档标题",
  "author": "作者",
  "date": "日期",
  "summary": "文档摘要",
  "sections": [
    {
      "heading": "章节标题",
      "page": 页码,
      "content": "章节内容摘要"
    }
  ],
  "tables": [
    {
      "page": 页码,
      "title": "表格标题",
      "data": "表格数据摘要"
    }
  ],
  "key_points": ["要点1", "要点2"]
}"""

    content = []
    for image_data in image_list:
        content.append({
            "type": "image_url",
            "image_url": {"url": f"data:image/jpeg;base64,{image_data}"}
        })
    content.append({"type": "text", "text": prompt})

    response = requests.post(
        "http://localhost:8000/v1/chat/completions",
        json={
            "model": "Qwen/Qwen3-VL-235B-A22B-Instruct",
            "messages": [{"role": "user", "content": content}],
            "temperature": 0.3  # 降低温度以获得更准确的结构化输出
        }
    )
    return response.json()
```

### 场景 7：PDF 表格提取

```python
def extract_pdf_tables(pdf_path):
    """提取 PDF 中的表格"""
    image_list = pdf_to_images(pdf_path)

    prompt = """请识别 PDF 中的所有表格，并为每个表格提供：
1. 表格标题（如果有）
2. 表格所在的页码
3. 表格的行列结构
4. 表格内容（以 Markdown 表格格式输出）

请按页码顺序列出所有表格。"""

    content = []
    for image_data in image_list:
        content.append({
            "type": "image_url",
            "image_url": {"url": f"data:image/jpeg;base64,{image_data}"}
        })
    content.append({"type": "text", "text": prompt})

    response = requests.post(
        "http://localhost:8000/v1/chat/completions",
        json={
            "model": "Qwen/Qwen3-VL-235B-A22B-Instruct",
            "messages": [{"role": "user", "content": content}]
        }
    )
    return response.json()
```

---

## 🔧 最佳实践

### 1. 提示词设计

**❌ 不好的提示词**：
```
分析这张图
```

**✅ 好的提示词**：
```
请分析这张电商产品图片，重点关注：
1. 产品名称和品牌
2. 产品外观特征
3. 价格和促销信息
4. 用户评价摘要
5. 产品细节展示
```

### 2. 图像预处理

```python
from PIL import Image

def preprocess_image(image_path, max_size=1920):
    """预处理图像以获得最佳效果"""
    img = Image.open(image_path)
    
    # 保持宽高比缩放
    if max(img.size) > max_size:
        ratio = max_size / max(img.size)
        new_size = tuple(int(dim * ratio) for dim in img.size)
        img = img.resize(new_size, Image.Resampling.LANCZOS)
    
    # 保存为 JPEG 格式
    output_path = image_path.replace(image_path.suffix, "_processed.jpg")
    img.save(output_path, "JPEG", quality=90)
    return output_path
```

### 3. 错误处理

```python
import json

def safe_analyze_image(image_path, prompt, max_retries=3):
    """带重试机制的图像分析"""
    for attempt in range(max_retries):
        try:
            with open(image_path, "rb") as f:
                image_data = base64.b64encode(f.read()).decode('utf-8')
            
            response = requests.post(
                "http://localhost:8000/v1/chat/completions",
                json={
                    "model": "Qwen/Qwen3-VL-235B-A22B-Instruct",
                    "messages": [
                        {
                            "role": "user",
                            "content": [
                                {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{image_data}"}},
                                {"type": "text", "text": prompt}
                            ]
                        }
                    ]
                },
                timeout=30
            )
            response.raise_for_status()
            return response.json()
        
        except requests.exceptions.Timeout:
            if attempt < max_retries - 1:
                time.sleep(2 ** attempt)  # 指数退避
                continue
            raise
        except Exception as e:
            print(f"Error: {e}")
            raise
```

### 4. 批量处理

```python
from concurrent.futures import ThreadPoolExecutor, as_completed

def batch_analyze_images(image_paths, prompt, max_workers=4):
    """批量分析图像"""
    results = {}

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {
            executor.submit(analyze_image, path, prompt): path
            for path in image_paths
        }

        for future in as_completed(futures):
            path = futures[future]
            try:
                results[path] = future.result()
            except Exception as e:
                results[path] = {"error": str(e)}

    return results
```

### 5. PDF 文档处理

```python
import pdf2image
from io import BytesIO
from PIL import Image

def optimize_pdf_conversion(pdf_path, dpi=150, max_size=1920):
    """优化 PDF 转换，控制图像大小"""
    images = pdf2image.convert_from_path(pdf_path, dpi=dpi)

    optimized_images = []
    for img in images:
        # 如果图像过大，进行缩放
        if max(img.size) > max_size:
            ratio = max_size / max(img.size)
            new_size = tuple(int(dim * ratio) for dim in img.size)
            img = img.resize(new_size, Image.Resampling.LANCZOS)

        # 转换为 base64
        buffered = BytesIO()
        img.save(buffered, format="JPEG", quality=85)
        image_data = base64.b64encode(buffered.getvalue()).decode('utf-8')
        optimized_images.append(image_data)

    return optimized_images

def analyze_large_pdf(pdf_path, pages_per_batch=5):
    """分批分析大型 PDF 文档"""
    image_list = optimize_pdf_conversion(pdf_path)
    total_pages = len(image_list)

    all_analysis = []

    # 分批处理
    for i in range(0, total_pages, pages_per_batch):
        batch = image_list[i:i + pages_per_batch]

        content = []
        for image_data in batch:
            content.append({
                "type": "image_url",
                "image_url": {"url": f"data:image/jpeg;base64,{image_data}"}
            })

        prompt = f"""分析第 {i + 1} 到 {min(i + pages_per_batch, total_pages)} 页的内容：
1. 页面标题
2. 主要内容
3. 关键信息"""

        content.append({"type": "text", "text": prompt})

        response = requests.post(
            "http://localhost:8000/v1/chat/completions",
            json={
                "model": "Qwen/Qwen3-VL-235B-A22B-Instruct",
                "messages": [{"role": "user", "content": content}]
            }
        )

        all_analysis.append({
            "pages": f"{i + 1}-{min(i + pages_per_batch, total_pages)}",
            "analysis": response.json()['choices'][0]['message']['content']
        })

    return all_analysis
```

---

## 📊 性能优化

### Token 使用优化

```python
def optimize_token_usage(image_path, prompt):
    """优化 Token 使用"""
    # 压缩图像
    img = Image.open(image_path)
    if img.size[0] * img.size[1] > 1920 * 1080:
        img.thumbnail((1920, 1080))
        buffer = io.BytesIO()
        img.save(buffer, format="JPEG", quality=85)
        image_data = base64.b64encode(buffer.getvalue()).decode('utf-8')
    else:
        with open(image_path, "rb") as f:
            image_data = base64.b64encode(f.read()).decode('utf-8')
    
    # 简化提示词
    response = requests.post(
        "http://localhost:8000/v1/chat/completions",
        json={
            "model": "Qwen/Qwen3-VL-235B-A22B-Instruct",
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{image_data}"}},
                        {"type": "text", "text": prompt}
                    ]
                }
            ],
            "max_tokens": 1024  # 限制输出长度
        }
    )
    return response.json()
```

---

## ❓ 常见问题

### Q1: 支持哪些图像格式？

**A**: 支持 JPEG、PNG、GIF、WebP、BMP、TIFF、HEIC 等常见格式。

### Q2: 图像大小限制？

**A**: 
- 公网 URL：单个图像不超过 10MB
- Base64 编码：编码后字符串不超过 10MB
- 推荐分辨率：控制在 4K (3840x2160) 以内

### Q3: 如何提高识别准确率？

**A**:
1. 使用清晰、高分辨率的图像
2. 确保图像对比度适中
3. 避免模糊、过曝或过暗的图像
4. 提供明确的提示词

### Q4: 视频分析支持哪些格式？

**A**: 支持通过图像列表（视频帧）或视频文件进行分析。建议使用性能较优的最新版模型。

### Q5: 如何处理多页文档？

**A**: 将每页转换为图像，使用多图像输入方式：

```python
def analyze_multi_page_doc(image_paths):
    content = []
    for path in image_paths:
        with open(path, "rb") as f:
            image_data = base64.b64encode(f.read()).decode('utf-8')
        content.append({"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{image_data}"}})
    
    content.append({"type": "text", "text": "请按页分析这个文档，并总结关键信息"})
    
    response = requests.post(
        "http://localhost:8000/v1/chat/completions",
        json={
            "model": "Qwen/Qwen3-VL-235B-A22B-Instruct",
            "messages": [{"role": "user", "content": content}]
        }
    )
    return response.json()
```

### Q6: 思考模式何时使用？

**A**: 
- 复杂推理任务
- 需要多步骤分析的场景
- 高精度要求
- 数学、物理、化学等学科问题

### Q7: 如何获取更详细的物体定位？

**A**: 使用物体定位提示词：

```python
prompt = """请检测图中所有物体，并以 JSON 格式输出：
{
  "objects": [
    {
      "name": "物体名称",
      "bbox": [x1, y1, x2, y2],
      "confidence": 0.95
    }
  ]
}"""
```

### Q8: 如何处理 PDF 文件？

**A**: Vision 代理可以将 PDF 转换为图片后进行分析：

```python
# 1. 安装依赖
pip install pdf2image

# 2. 安装 poppler（系统依赖）
# macOS: brew install poppler
# Linux: sudo apt-get install poppler-utils
# Windows: 从 GitHub 下载安装

# 3. 转换并分析
from pdf2image import pdf_to_images
import requests
import base64
from io import BytesIO
from PIL import Image

def analyze_pdf(pdf_path):
    # 转换 PDF 为图片
    images = pdf2image.convert_from_path(pdf_path, dpi=200)

    # 构建多图像输入
    content = []
    for img in images:
        buffered = BytesIO()
        img.save(buffered, format="JPEG", quality=90)
        image_data = base64.b64encode(buffered.getvalue()).decode('utf-8')
        content.append({
            "type": "image_url",
            "image_url": {"url": f"data:image/jpeg;base64,{image_data}"}
        })

    content.append({"type": "text", "text": "请分析这个 PDF 文档的内容"})

    response = requests.post(
        "http://localhost:8000/v1/chat/completions",
        json={
            "model": "Qwen/Qwen3-VL-235B-A22B-Instruct",
            "messages": [{"role": "user", "content": content}]
        }
    )
    return response.json()
```

### Q9: PDF 转换时遇到 "poppler not found" 错误怎么办？

**A**: 需要安装 poppler 系统依赖：

```bash
# macOS
brew install poppler

# Ubuntu/Debian
sudo apt-get install poppler-utils

# CentOS/RHEL
sudo yum install poppler-utils

# Windows
# 从 https://github.com/oschwartz10612/poppler-windows/releases/ 下载
# 解压后将 bin 目录添加到 PATH 环境变量
```

### Q10: 如何处理大型 PDF 文件？

**A**: 分批处理 PDF 文件以避免 Token 超限：

```python
def analyze_large_pdf_batch(pdf_path, batch_size=5):
    """分批分析大型 PDF"""
    images = pdf2image.convert_from_path(pdf_path, dpi=150)

    results = []
    for i in range(0, len(images), batch_size):
        batch = images[i:i + batch_size]

        # 只分析当前批次
        content = []
        for img in batch:
            buffered = BytesIO()
            img.save(buffered, format="JPEG", quality=85)
            image_data = base64.b64encode(buffered.getvalue()).decode('utf-8')
            content.append({
                "type": "image_url",
                "image_url": {"url": f"data:image/jpeg;base64,{image_data}"}
            })

        content.append({
            "type": "text",
            "text": f"分析第 {i + 1} 到 {i + len(batch)} 页的内容"
        })

        response = requests.post(
            "http://localhost:8000/v1/chat/completions",
            json={
                "model": "Qwen/Qwen3-VL-235B-A22B-Instruct",
                "messages": [{"role": "user", "content": content}]
            }
        )
        results.append(response.json())

    return results
```

### Q11: 如何提高 PDF 转换质量？

**A**: 调整 DPI 和压缩参数：

```python
def high_quality_pdf_conversion(pdf_path):
    """高质量 PDF 转换"""
    images = pdf2image.convert_from_path(
        pdf_path,
        dpi=300,  # 提高 DPI 以获得更好的质量
        fmt='jpeg',
        thread_count=4  # 使用多线程加速
    )

    optimized = []
    for img in images:
        # 限制最大尺寸以控制 Token 使用
        max_size = 1920
        if max(img.size) > max_size:
            ratio = max_size / max(img.size)
            new_size = tuple(int(dim * ratio) for dim in img.size)
            img = img.resize(new_size, Image.Resampling.LANCZOS)

        buffered = BytesIO()
        img.save(buffered, format="JPEG", quality=95)  # 提高质量
        image_data = base64.b64encode(buffered.getvalue()).decode('utf-8')
        optimized.append(image_data)

    return optimized
```

---

## 📚 参考资料

- [Qwen3-VL 官方文档](https://help.aliyun.com/zh/model-studio/developer-reference/use-qwen-vl-by-calling-api)
- [模型列表](https://help.aliyun.com/zh/model-studio/models)
- [API 参考](https://help.aliyun.com/zh/model-studio/developer-reference/compatibility-of-openai-with-qwen)
- [计费说明](https://help.aliyun.com/zh/model-studio/billing)

---

## 🤝 贡献

如有问题或建议，请提交 Issue 或 Pull Request。

---

## 📄 许可证

本项目遵循 Pi Agent 项目的许可证。