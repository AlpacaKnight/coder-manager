#!/bin/sh

# Cargo 传入的参数包含链接器参数，直接转发给最终的 C 编译器。
# 优先使用系统 gcc，避免 conda 等环境覆盖 gcc；在精简发行版或其他
# 工具链环境中则回退到当前 PATH 中的 gcc、cc 或 clang。
if [ -x /usr/bin/gcc ]; then
  exec /usr/bin/gcc "$@"
fi

if command -v gcc >/dev/null 2>&1; then
  exec gcc "$@"
fi

if command -v cc >/dev/null 2>&1; then
  exec cc "$@"
fi

if command -v clang >/dev/null 2>&1; then
  exec clang "$@"
fi

echo "rust-linker: no suitable C linker found (tried /usr/bin/gcc, gcc, cc, clang)" >&2
exit 127
