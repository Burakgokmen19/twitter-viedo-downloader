# TwitSave - Sosyal Video İndirici

X, Instagram ve TikTok video bağlantılarını indirmeye yardımcı olan web uygulaması.

## Özellikler

- Koyu yeşil ve krem renk paletli responsive arayüz
- Tam mobil ve desktop uyumlu (responsive)
- X, Instagram Reels ve TikTok video bağlantısı desteği
- Cihaz destekliyorsa videoyu WhatsApp paylaşım menüsünden gönderme
- Google Ads entegrasyonu hazır
- SEO optimizasyonu yapılmış

İndirilen medya platformun sunduğu kaynak biçiminde kalır; kaynak videodaki filigran korunur. İndirme hakkına sahip olduğunuz içerikleri kullanın. Instagram ve TikTok desteği `yt-dlp` ile herkese açık bağlantılarda çalışır; özel hesaplar veya oturum açma gerektiren videolar desteklenmez.

## Kurulum

```bash
npm install
npm start
```

Tarayıcıda `http://localhost:3000` adresini açın.

Kurulum sırasında `yt-dlp` resmi GitHub sürümünden indirilir. Kurulum ve dağıtım ortamının GitHub'a erişebilmesi gerekir. Instagram/TikTok video akışı 100 MB ile sınırlıdır.

## Vercel'e Deploy

1. GitHub'a push edin
2. [vercel.com](https://vercel.com) adresine gidin
3. GitHub reponuzu import edin
4. Deploy butonuna tıklayın

## Teknolojiler

- Node.js + Express.js
- Vanilla HTML/CSS/JS
- fxtwitter API
