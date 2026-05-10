# Port Konflik WebSocket Saat Development

## Masalah

Saat menjalankan beberapa project Bun bersamaan di mesin yang sama, port
WebSocket bisa bertabrakan dengan error:

```
WebSocket server error: Port undefined is already in use
```

Root cause: dua port hardcoded di project — **Vite HMR WebSocket (24678)** dan
**OAuth Callback (54545)**. Jika project Bun lain juga pakai port yang sama,
terjadi konflik.

## Solusi

Port dibuat configurable via environment variable:

| Env var | Default | Keterangan |
|---|---|---|
| `REACT_DEV_HMR_PORT` | `24678` | Port Vite HMR WebSocket — hanya dipakai saat `bun dev` |
| `OAUTH_CALLBACK_PORT` | `54545` | Port callback OAuth — redirect browser setelah authorize di claude.ai |

### Cara Pakai

Di file `.env`:

```bash
# Ganti port agar tidak bertabrakan dengan project lain
REACT_DEV_HMR_PORT=24679
OAUTH_CALLBACK_PORT=54546
```

Atau inline:

```bash
REACT_DEV_HMR_PORT=24679 OAUTH_CALLBACK_PORT=54546 bun dev
```

### File yang Diubah

| File | Perubahan |
|---|---|
| `vite.config.ts` | `hmr.port` baca dari `process.env.REACT_DEV_HMR_PORT` |
| `src/handlers/apiAuth.ts` | `CALLBACK_URI` baca dari `config.oauthCallbackPort` |
| `src/config.ts` | Tambah `oauthCallbackPort` dan `hmrPort` |
| `.env.example` | Tambah section "Dev-only ports" |

## Cara Kerja OAuth Callback

Port 54545 tidak benar-benar di-bind server. Port ini adalah bagian dari URL
callback yang didaftarkan di OAuth client Anthropic. Browser user akan
di-redirect ke URL tersebut setelah authorize — lalu user menyalin URL dari
address bar dan paste ke UI admin. Port ini HARUS sesuai dengan yang
didaftarkan di OAuth client (`redirect_uri`).
