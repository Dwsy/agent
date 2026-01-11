"""
Setup script for mcp-to-skill Python package.
"""

from setuptools import setup, find_packages

setup(
    name="mcp-to-skill",
    version="2.0.0",
    packages=find_packages(),
    include_package_data=True,
    install_requires=[
        "httpx>=0.25.0",
    ],
    extras_require={
        "dev": [
            "pytest>=7.0.0",
            "pytest-asyncio>=0.21.0",
            "black>=23.0.0",
            "ruff>=0.1.0",
        ],
    },
    entry_points={
        "console_scripts": [
            "mcp-to-skill=cli:main",
        ],
    },
)