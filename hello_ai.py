"""实验一步骤 5 —— AI 辅助编程最小示例。

需求描述（提交给 AI 工具的原话）：
    「用 Python 写一个最小的命令行程序，运行时输出一行：Hello, AI 编程！」

AI 初版生成的代码使用 ``print("Hello, AI 编程！")`` 直接输出。
人工校验后做了一处微调：把输出放进 ``main()`` 函数并用
``if __name__ == "__main__":`` 守卫，使其可以被其他模块安全导入。

运行::

    python hello_ai.py
"""


def greet() -> str:
    """返回问候语。单独抽出，便于将来做单元测试或复用。"""
    return "Hello, AI 编程！"


def main() -> None:
    print(greet())


if __name__ == "__main__":
    main()
