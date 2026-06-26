# Centradar Backend

Mainnet notlari:
- `ALLOW_DEMO_BUY=false` olmalidir. Demo mermi alimi kapali kalir; gercek alimlar blockchain islemiyle dogrulanir.
- `ALLOW_DEMO_PURCHASES` eski uyumluluk adidir; mainnet'te false birakilmalidir.
- `ADMIN_TOKEN`, `AUTH_SECRET`, `ABSWAR_CONTRACT_ADDRESS` ve Rank NFT secretlari Railway degiskenlerinde tutulmalidir.
- `RANK_NFT_CONTRACT_ADDRESS` yeni rozet kontratini gostermelidir.
- Bagimsiz denetim hazirlik notlari icin `AUDIT_READINESS.md` dosyasini kullan.

## FELAKET KURTARMA

1. Yeni bir Postgres veritabani ac.
2. `DATABASE_URL` ortam degiskenini yeni veritabanina ayarla.
3. `node restore-backup.js yedek.json --yes --wipe` komutunu calistir.
4. Railway backend servisini yeniden baslat.
5. Smoke-test calistir ve `/api/game/state` ile oyuncu bakiyelerini kontrol et.
