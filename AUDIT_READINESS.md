# Centradar Audit Readiness

Bu dosya bagimsiz smart contract / backend denetimi icin hazirlik notudur.

## Kapsam

- Network: Abstract Mainnet, Chain ID `2741`
- Frontend: `https://centradar.xyz`
- Backend API: `https://api.centradar.xyz`
- Oyun contract env: `ABSWAR_CONTRACT_ADDRESS`
- Rank NFT contract env: `RANK_NFT_CONTRACT_ADDRESS`

## Kritik Akislar

1. Mermi alimi: frontend tx gonderir, backend `/api/market/buy` ile tx hash'i on-chain dogrular.
2. Saldiri: `/api/game/attack` server-side mermi dusumu, hasar, HP ve katkı hesabı yapar.
3. Odul: tur bitince kazananlar hesaplanir; admin `payReward` tx hashini `/api/admin/round/payout-log` ile kaydeder.
4. Rank NFT: backend uygun rutbe icin imza uretir; mint kullanici cüzdanindan yapilir, NFT soulbound'dur.

## Denetim Kontrol Listesi

- [ ] Contract `buyAmmo`, `payReward`, `withdrawTreasury`, `withdrawOperations` access control.
- [ ] `payReward` reentrancy ve havuz azaltma sirasi.
- [ ] Backend tx dogrulama: chain, tx.to, tx.from, value, receipt status, event.
- [ ] Ayni tx hash ile tekrar mermi yazilamamasi.
- [ ] Admin endpointlerinde owner session + admin token kontrolu.
- [ ] Client HP/mermi/katki verisine guvenilmemesi.
- [ ] Rank NFT imza replay korumasi: contract, chainId, player, rank, deadline.
- [ ] Rate limit ve mainnet demo-buy kapali durumu.
- [ ] Backup/restore icinde purchases tablosu.

## Operasyon Notlari

- `ALLOW_DEMO_BUY=false`
- `AUTH_SECRET`, `ADMIN_TOKEN`, `DATABASE_URL`, `RANK_NFT_SIGNER_PRIVATE_KEY` sadece Railway env'de tutulur.
- `/api/status`, `/api/reward/status`, `/api/admin/health` canli kontrol icin kullanilir.
- Ekonomi alanlari `recordedTotalEth`, `onchainRewardPoolEth` ve `rewardPoolSource` ayrimini gosterir.

## Bilinen Tasarim Kararlari

- Bu surumde odul odemesi otomatik escrow degil; admin `payReward` islemiyle kayitli ve seffaf akistir.
- `AmmoPurchased.amount` kontrattaki 0.001 ETH temel birimini gosterir; oyun ici bonuslu mermi paketleri backend tarafinda tx tutarina gore hesaplanir.
- Tam otomatik escrow ve event seviyesinde bonuslu mermi muhasebesi yeni contract surumu gerektirir.
