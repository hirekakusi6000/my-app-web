# オフィス座席・従業員管理システム（画面）

オフィスの座席配置・在席状況・プロフィール・スキルを管理する Web アプリの **画面**（Vue 3 + Vite + TypeScript）です。

**README と設計書は、ドキュメントのリポジトリ `my-app-docs` にまとめています。**
開発環境の構築・コマンドは `my-app-docs` の `README.md`、公開の手順は `design/07-deployment.md` を参照してください。

| リポジトリ | 内容 |
|---|---|
| `my-app` | API（Python / FastAPI / SQLite） |
| `my-app-web`（ここ） | 画面 |
| `my-app-docs` | README と設計書 |

## 起動（Windows / PowerShell）

先に API（`my-app`）を起動しておきます。Node.js 22.12 以上と nginx が必要です（入れ方は `my-app-docs` の `README.md`）。

```powershell
npm install
npm run dev
```

ブラウザで http://127.0.0.1:8080 を開きます（開発時も公開時と同じ nginx で画面を返します）。
