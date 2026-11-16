/** @type {import('tailwindcss').Config} */
// 复用扩展仓库根的配置（颜色/字体/动画等），只把 content 改为相对本目录的路径，
// 让 Tailwind 扫描到共享的页面/组件源码，生成它们用到的工具类。
import base from "../tailwind.config.js";

export default {
  ...base,
  content: [
    "../assets/**",
    "../entrypoints/**",
    "../pages/**",
    "../components/**",
    "./src/**",
  ],
};
