import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { defineConfig, loadEnv } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const semiUiDir = path.resolve(
  path.dirname(require.resolve('@douyinfe/semi-ui')),
  '../..',
);
const semiDateFnsDir = path.dirname(
  require.resolve('date-fns/package.json', { paths: [semiUiDir] }),
);

// classic 使用 @visactor/vchart@1.8.x(依赖 vrender 0.17.x),而 default 使用 vchart@2.x,
// 会把更高版本的 vrender hoist 到顶层 node_modules。其中 vchart-semi-theme 会解析到那份
// 高版本 vrender-core,与 vchart/react-vchart 用的 0.17.x 不一致,导致 VChart 渲染环境
// 错乱(createCanvas is undefined,控制台图表页白屏)。这里把三个 vrender 包统一指向
// classic 自带 vchart 依赖的那一份,保证整个 classic 包内只有一份 vrender。
const vrenderAlias: Record<string, string> = {};
try {
  const vchartDir = path.dirname(
    require.resolve('@visactor/vchart/package.json'),
  );
  for (const pkg of [
    '@visactor/vrender-core',
    '@visactor/vrender-kits',
    '@visactor/vrender-components',
  ]) {
    vrenderAlias[pkg] = path.dirname(
      require.resolve(`${pkg}/package.json`, { paths: [vchartDir] }),
    );
  }
} catch {
  // 解析失败则不加 alias,避免构建中断
}

export default defineConfig(({ envMode }) => {
  const env = loadEnv({ mode: envMode, prefixes: ['VITE_'] });
  const clientServerUrl =
    process.env.VITE_REACT_APP_SERVER_URL ||
    env.rawPublicVars.VITE_REACT_APP_SERVER_URL ||
    '';
  const proxyServerUrl = clientServerUrl || 'http://localhost:3000';
  const isProd = envMode === 'production';
  const devProxy = Object.fromEntries(
    (['/api', '/mj', '/pg'] as const).map((key) => [
      key,
      { target: proxyServerUrl, changeOrigin: true },
    ]),
  ) as Record<string, { target: string; changeOrigin: boolean }>;

  return {
    plugins: [pluginReact()],
    source: {
      entry: {
        index: './src/index.jsx',
      },
      define: {
        'import.meta.env.VITE_REACT_APP_SERVER_URL':
          JSON.stringify(clientServerUrl),
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        '@douyinfe/semi-ui/dist/css/semi.css': path.resolve(
          semiUiDir,
          'dist/css/semi.css',
        ),
        // Semi UI still depends on date-fns-tz v1, which expects date-fns v2 internals.
        'date-fns': semiDateFnsDir,
        // 统一 classic 内的 vrender 版本(见上方 vrenderAlias 注释)。
        ...vrenderAlias,
      },
    },
    html: {
      template: './index.html',
      favicon: './public/logo.png',
    },
    server: {
      host: '0.0.0.0',
      strictPort: false,
      proxy: devProxy,
    },
    output: {
      minify: isProd,
      target: 'web',
      distPath: {
        root: 'dist',
      },
    },
    performance: {
      removeConsole: isProd ? ['log'] : false,
      buildCache: {
        cacheDigest: [process.env.VITE_REACT_APP_VERSION],
      },
    },
    tools: {
      rspack: {
        module: {
          rules: [
            {
              test: /src[\\/].*\.js$/,
              type: 'javascript/auto',
              use: [
                {
                  loader: 'builtin:swc-loader',
                  options: {
                    jsc: {
                      parser: {
                        syntax: 'ecmascript',
                        jsx: true,
                      },
                      transform: {
                        react: {
                          runtime: 'automatic',
                          development: !isProd,
                          refresh: !isProd,
                        },
                      },
                    },
                  },
                },
              ],
            },
          ],
        },
      },
    },
  };
});
