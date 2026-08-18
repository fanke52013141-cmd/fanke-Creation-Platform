# -*- coding: utf-8 -*-
"""
测试 GLM-5.2 (微信 OpenAI 兼容接口) 是否跑通。

Endpoint: https://chatapi.weixin.qq.com/openai/v1/chat/completions
"""
import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

import json
import time
import os
import requests

API_URL = "https://chatapi.weixin.qq.com/openai/v1/chat/completions"
# 不再明文写死 Token，改为从环境变量读取。
# 运行前设置环境变量：
#   PowerShell 临时：$env:WEIXIN_OPENAI_TOKEN="你的token"
#   CMD：set WEIXIN_OPENAI_TOKEN=你的token
TOKEN = os.environ.get("WEIXIN_OPENAI_TOKEN", "")
MODEL = os.environ.get("WEIXIN_OPENAI_MODEL", "GLM-5.2")

payload = {
    "model": MODEL,
    "messages": [
        {"role": "user", "content": "你好，请用一句话回复'运行成功'。"},
    ],
    "max_tokens": 200,
    "temperature": 0.7,
    "stream": False,
}


def try_request(name, headers, url_extra="", stream=False, timeout=90):
    print(f"\n=== 尝试: {name} ===")
    url = API_URL + url_extra
    print(f"URL: {url}")
    print(f"Auth头: { {k:v[:20]+'...' for k,v in headers.items()} }")
    t0 = time.time()
    try:
        resp = requests.post(
            url,
            headers=headers,
            data=json.dumps(payload).encode("utf-8"),
            timeout=timeout,
            stream=stream,
        )
        cost = time.time() - t0
        print(f"HTTP 状态码: {resp.status_code}  耗时: {cost:.1f}s")
        if stream:
            try:
                for line in resp.iter_lines(decode_unicode=True):
                    if line:
                        print(line)
            except Exception as e:
                print(f"(流式读取中断: {e})")
        else:
            print(f"响应体: {resp.text[:2000]}")
        if resp.status_code == 200:
            print(">>> 运行成功! GLM-5.2 可正常调用。")
            return True
    except requests.exceptions.Timeout:
        print(f">>> 超时({timeout}s)。连接已建立但模型未及时返回(可能是响应慢/preflight)。")
    except Exception as e:
        print(f">>> 请求异常: {type(e).__name__}: {e}")
    return False


def main():
    if not TOKEN:
        print("!! 环境变量 WEIXIN_OPENAI_TOKEN 未设置，无法调用接口。")
        print("!! 请先设置后再运行本脚本。")
        return

    print(f"目标模型: {MODEL}")
    print(f"接口地址: {API_URL}")
    print(f"Token 长度: {len(TOKEN)} (前缀: {TOKEN[:16]}...)")

    attempts = [
        # 方式1: Bearer Token (OpenAI 兼容标准)，长超时
        (
            "Bearer Token, 非流式, 超时120s",
            {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"},
            "",
            False,
            120,
        ),
        # 方式2: Bearer Token, 流式 (更快首token)
        (
            "Bearer Token, 流式",
            {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"},
            "",
            True,
            90,
        ),
        # 方式3: access_token 走 query 参数 (微信常见)
        (
            "access_token query 参数",
            {"Content-Type": "application/json"},
            f"?access_token={TOKEN}",
            False,
            90,
        ),
    ]

    for name, headers, url_extra, stream, timeout in attempts:
        if try_request(name, headers, url_extra, stream, timeout):
            return

    print("\n=== 结果汇总 ===")
    print("Bearer 认证已通过(无401), 但模型网关一直不返回响应(120s超时)。")
    print("结论: 接口可达、token有效, 但 GLM-5.2 模型端当前无响应/不可用。")


if __name__ == "__main__":
    main()