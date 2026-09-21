/**
 * Expanded Prompt Helper option sets (≥15 per dimension where practical).
 * Previews resolve via resolveOptionPreview (thumb → SVG/swatch fallback).
 */

type Opt = { id: string; label: string; modifier: string; character?: string };

export type OptionSetDimension = {
  id: string;
  title: string;
  hint?: string;
  options: Opt[];
};

const CAT_COLORS: Opt[] = [
  { id: "orange", label: "ส้ม", modifier: "สีส้มสดใส" },
  { id: "black", label: "ดำ", modifier: "สีดำขลับ ดวงตาสว่าง" },
  { id: "gray", label: "เทา", modifier: "สีเทาควันบุหรี่" },
  { id: "white", label: "ขาว", modifier: "สีขาวบริสุทธิ์ ขนนุ่มฟู" },
  { id: "tabby", label: "ลายสลิด", modifier: "ลายสลิดคลาสสิก" },
  { id: "calico", label: "สามสี", modifier: "สามสี (Calico) น่ารัก" },
  { id: "cream", label: "ครีม", modifier: "สีครีมนุ่มละมุน" },
  { id: "silver", label: "เงิน", modifier: "ขนสีเงินแวววาว" },
  { id: "chocolate", label: "ช็อกโกแลต", modifier: "ขนสีช็อกโกแลตเข้ม" },
  { id: "blue-gray", label: "บลูเกรย์", modifier: "ขนสีเทาอมฟ้า (Blue)" },
  { id: "ginger-white", label: "ส้มขาว", modifier: "ขนส้มปนขาว" },
  { id: "tuxedo", label: "ทักซิโด", modifier: "ลายทักซิโดดำขาว" },
  { id: "tortoiseshell", label: "เต่าทอง", modifier: "ลายเต่าทอง (Tortoiseshell)" },
  { id: "smoke", label: "สโมก", modifier: "ขนสีสโมกไล่โทน" },
  { id: "cinnamon", label: "ซินนามอน", modifier: "ขนสีซินนามอนอุ่น" },
];

const CAT_BREEDS: Opt[] = [
  { id: "shorthair", label: "ช็อตแฮร์", modifier: "สายพันธุ์โดเมสติก ช็อตแฮร์" },
  { id: "scottish", label: "สกอตติชโฟลด์", modifier: "สายพันธุ์สกอตติชโฟลด์ หูพับ" },
  { id: "british", label: "บริติชช็อตแฮร์", modifier: "สายพันธุ์บริติชช็อตแฮร์ แก้มกลม" },
  { id: "persian", label: "เปอร์เซีย", modifier: "สายพันธุ์เปอร์เซีย ขนยาวฟู" },
  { id: "siamese", label: "สยาม", modifier: "สายพันธุ์วิเชียรมาศ ดวงตาสีฟ้า" },
  { id: "maine-coon", label: "เมนคูน", modifier: "สายพันธุ์เมนคูน ตัวใหญ่ ขนฟู" },
  { id: "ragdoll", label: "แร็กดอลล์", modifier: "สายพันธุ์แร็กดอลล์ ตาฟ้า นิสัยอ่อนโยน" },
  { id: "bengal", label: "เบงกอล", modifier: "สายพันธุ์เบงกอล ลายเสือดาว" },
  { id: "sphynx", label: "สฟิงซ์", modifier: "สายพันธุ์สฟิงซ์ ไร้ขน ผิวเรียบ" },
  { id: "russian-blue", label: "รัสเซียนบลู", modifier: "สายพันธุ์รัสเซียนบลู ขนเงินตาเขียว" },
  { id: "abyssinian", label: "อะบิสซิเนียน", modifier: "สายพันธุ์อะบิสซิเนียน ขนทิคกิ้ง" },
  { id: "norwegian", label: "นอร์วีเจียน", modifier: "สายพันธุ์นอร์วีเจียนฟอเรสต์ ขนหนา" },
  { id: "american-curl", label: "อเมริกันเคิร์ล", modifier: "สายพันธุ์อเมริกันเคิร์ล หูม้วน" },
  { id: "munchkin", label: "มันช์กิน", modifier: "สายพันธุ์มันช์กิน ขาสั้นน่ารัก" },
  { id: "exotic", label: "เอ็กโซติก", modifier: "สายพันธุ์เอ็กโซติกช็อตแฮร์ หน้ากลม" },
];

const DOG_BREEDS: Opt[] = [
  { id: "golden", label: "โกลเด้น", modifier: "สายพันธุ์โกลเด้นรีทรีฟเวอร์ ร่าเริง ขนสีทอง" },
  { id: "corgi", label: "คอร์กี้", modifier: "สายพันธุ์เวลช์ คอร์กี้ ขาสั้น หูกาง น่ารัก" },
  { id: "shiba", label: "ชิบะ", modifier: "สายพันธุ์ชิบะอินุ ยิ้มหวาน สดใส" },
  { id: "poodle", label: "พุดเดิ้ล", modifier: "สายพันธุ์พุดเดิ้ลทอย ขนหยิกนุ่มฟู" },
  { id: "husky", label: "ไซบีเรียน", modifier: "สายพันธุ์ไซบีเรียน ฮัสกี้ เท่ ตาฟ้า" },
  { id: "labrador", label: "ลาบราดอร์", modifier: "สายพันธุ์ลาบราดอร์รีทรีฟเวอร์ เป็นมิตร" },
  { id: "beagle", label: "บีเกิล", modifier: "สายพันธุ์บีเกิล หูยาว ร่าเริง" },
  { id: "bulldog", label: "บูลด็อก", modifier: "สายพันธุ์อิงลิชบูลด็อก หน้าย่น น่ารัก" },
  { id: "pomeranian", label: "ปอมเมอเรเนียน", modifier: "สายพันธุ์ปอมเมอเรเนียน ขนฟูตัวเล็ก" },
  { id: "chihuahua", label: "ชิวาวา", modifier: "สายพันธุ์ชิวาวา ตัวจิ๋ว ตาโต" },
  { id: "german-shepherd", label: "เยอรมันเชพเพิร์ด", modifier: "สายพันธุ์เยอรมันเชพเพิร์ด ฉลาด แข็งแรง" },
  { id: "samoyed", label: "ซามอยด์", modifier: "สายพันธุ์ซามอยด์ ขนขาวยิ้มหวาน" },
  { id: "dalmatian", label: "ดัลเมเชียน", modifier: "สายพันธุ์ดัลเมเชียน ลายจุดขาวดำ" },
  { id: "french-bulldog", label: "เฟรนช์บูลด็อก", modifier: "สายพันธุ์เฟรนช์บูลด็อก หูค้างคาว" },
  { id: "border-collie", label: "บอร์เดอร์คอลลี่", modifier: "สายพันธุ์บอร์เดอร์คอลลี่ ฉลาดว่องไว" },
];

const DOG_COLORS: Opt[] = [
  { id: "golden-color", label: "ทอง/ครีม", modifier: "สีทองครีม อบอุ่น" },
  { id: "black-color", label: "ดำ", modifier: "สีดำเงางาม" },
  { id: "brown-color", label: "น้ำตาล", modifier: "สีน้ำตาลช็อกโกแลต" },
  { id: "white-color", label: "ขาว", modifier: "สีขาวปุย" },
  { id: "cream", label: "ครีมอ่อน", modifier: "สีครีมอ่อนละมุน" },
  { id: "silver", label: "เงิน", modifier: "ขนสีเงินเทา" },
  { id: "red-brown", label: "น้ำตาลแดง", modifier: "ขนสีน้ำตาลแดงอุ่น" },
  { id: "brindle", label: "ลายเสือ", modifier: "ลายเสือ (Brindle)" },
  { id: "spotted", label: "ลายจุด", modifier: "ลายจุดขาวดำชัด" },
  { id: "tricolor", label: "สามสี", modifier: "ขนสามสีคลาสสิก" },
  { id: "sable", label: "เซเบิล", modifier: "ขนเซเบิลไล่โทน" },
  { id: "blue-merle", label: "บลูเมอร์ล", modifier: "ลายบลูเมอร์ล" },
  { id: "fawn", label: "ฟอว์น", modifier: "สีฟอว์นอ่อน" },
  { id: "liver", label: "ลิเวอร์", modifier: "สีลิเวอร์น้ำตาลอมแดง" },
  { id: "apricot", label: "แอปริคอต", modifier: "สีแอปริคอตพาสเทล" },
];

const PET_BACKGROUNDS: Opt[] = [
  { id: "living-room", label: "ห้องนั่งเล่นอบอุ่น", modifier: "ฉากห้องนั่งเล่นอบอุ่น พื้นไม้และโซฟาสบายตา" },
  { id: "window", label: "ริมหน้าต่างแดดส่อง", modifier: "ฉากริมหน้าต่างกระจก มีแสงแดดยามเช้าส่องละมุน" },
  { id: "garden", label: "สวนดอกไม้", modifier: "ฉากสวนหย่อมกลางแจ้ง ทุ่งหญ้าและดอกไม้" },
  { id: "bed", label: "บนเตียงนอน", modifier: "ฉากบนเตียงนอนนุ่ม บรรยากาศผ่อนคลาย" },
  { id: "cafe", label: "คาเฟ่มินิมอล", modifier: "ฉากคาเฟ่มินิมอล โทนอบอุ่น" },
  { id: "park", label: "สวนสาธารณะ", modifier: "ฉากสนามหญ้าในสวนสาธารณะ แสงแดดสดใส" },
  { id: "beach", label: "ชายหาดริมทะเล", modifier: "ฉากชายหาดริมทะเล ทรายขาว คลื่นซัดเบาๆ" },
  { id: "home", label: "สนามหญ้าหน้าบ้าน", modifier: "ฉากสนามหญ้าหน้าบ้าน บรรยากาศอบอุ่น" },
  { id: "studio", label: "สตูดิโอคลีน", modifier: "ฉากสตูดิโอสีพาสเทลสะอาดตา" },
  { id: "bookshelf", label: "มุมหนังสือ", modifier: "ฉากมุมชั้นหนังสือโทนอบอุ่นในบ้าน" },
  { id: "kitchen", label: "ครัวบ้าน", modifier: "ฉากครัวบ้านแสงธรรมชาติ" },
  { id: "balcony", label: "ระเบียงเมือง", modifier: "ฉากระเบียงคอนโดวิวเมือง" },
  { id: "snow", label: "หิมะขาว", modifier: "ฉากทุ่งหิมะขาวสะอาดตา" },
  { id: "autumn", label: "ใบไม้ร่วง", modifier: "ฉากสวนฤดูใบไม้ร่วงใบส้มทอง" },
  { id: "night-city", label: "กลางคืนในเมือง", modifier: "ฉากกลางคืนไฟเมืองโบเก้" },
];

const CAMERA_ANGLES: Opt[] = [
  { id: "front", label: "มุมตรง", modifier: "มุมกล้องมองตรง สัดส่วนสมดุล มองเห็นรายละเอียดชัดเจน" },
  { id: "closeup", label: "Close-up", modifier: "มุมกล้อง Close-up โฟกัสใบหน้าและดวงตาคมชัด โบเก้ละมุน" },
  { id: "eyelevel", label: "ระดับสายตา", modifier: "มุมกล้องระดับสายตา (Eye-level) เป็นธรรมชาติ" },
  { id: "topdown", label: "Top-down", modifier: "มุมกล้อง Top-down มองลงมาจากด้านบน" },
  { id: "wide", label: "มุมกว้าง", modifier: "มุมกล้องกว้าง เห็นตัวแบบพร้อมบรรยากาศโดยรอบ" },
  { id: "action", label: "Action Shot", modifier: "มุมกล้อง Action Shot ถ่ายทอดความร่าเริงขณะเคลื่อนไหว" },
  { id: "low-angle", label: "มุมต่ำ", modifier: "มุมกล้องต่ำมองขึ้น ทำให้ตัวแบบดูเด่น" },
  { id: "dutch", label: "Dutch Angle", modifier: "มุมกล้องเฉียง Dutch Angle มีพลัง" },
  { id: "macro", label: "Macro", modifier: "มุม Macro เจาะรายละเอียดขนและพื้นผิว" },
  { id: "over-shoulder", label: "Over-shoulder", modifier: "มุมกล้องเหนือไหล่ ดูเป็นเรื่องราว" },
  { id: "profile", label: "ด้านข้าง", modifier: "มุมกล้องโปรไฟล์ด้านข้างเงางาม" },
  { id: "three-quarter", label: "สามส่วนสี่", modifier: "มุมสามส่วนสี่คลาสสิก" },
  { id: "birdseye", label: "Bird's-eye", modifier: "มุมมองจากฟ้า Bird's-eye" },
  { id: "selfie", label: "Selfie", modifier: "มุมเซลฟี่ใกล้ระยะแขน" },
  { id: "cinematic", label: "Cinematic", modifier: "มุมกล้อง Cinematic กว้าง แสงเงาคม" },
  { id: "isometric", label: "Isometric", modifier: "มุมมอง Isometric 3D มีมิติ" },
];

const ART_STYLES: Opt[] = [
  {
    id: "photorealistic",
    label: "ภาพถ่ายสมจริง",
    modifier: "สไตล์ภาพถ่ายสมจริง (Photorealistic) รายละเอียดคมชัดสูง",
  },
  { id: "anime", label: "อนิเมะญี่ปุ่น", modifier: "สไตล์อนิเมะญี่ปุ่น สีสันสดใส ลายเส้นสะอาด" },
  { id: "3d", label: "3D Animation", modifier: "สไตล์ 3D Animation น่ารัก มีมิติ" },
  { id: "watercolor", label: "ภาพวาดสีน้ำ", modifier: "สไตล์ภาพวาดสีน้ำ ละมุนตา พริ้วไหว" },
  { id: "oil", label: "สีน้ำมัน", modifier: "สไตล์ภาพวาดสีน้ำมัน คลาสสิกมีฝีแปรง" },
  { id: "flat", label: "Vector Flat", modifier: "สไตล์เวกเตอร์ Flat Art ลายเส้นสะอาด" },
  { id: "painting", label: "ภาพวาดศิลปะ", modifier: "สไตล์ภาพวาดศิลปะ มีเนื้อสีเอกลักษณ์" },
  { id: "ghibli", label: "จิบลิ", modifier: "สไตล์ Studio Ghibli อบอุ่นชวนฝัน" },
  { id: "illustration", label: "อิลลัสเตรต", modifier: "สไตล์ภาพวาดมินิมอลโมเดิร์น" },
  { id: "pixel", label: "Pixel Art", modifier: "สไตล์ Pixel Art น่ารักย้อนยุค" },
  { id: "comic", label: "Comic", modifier: "สไตล์การ์ตูนคอมมิค เส้นขอบชัด" },
  { id: "clay", label: "Claymation", modifier: "สไตล์ดินน้ำมัน Claymation นุ่มนวล" },
  { id: "ink", label: "หมึกจีน", modifier: "สไตล์หมึกพู่กันจีนขาวดำ" },
  { id: "pastel-art", label: "พาสเทล", modifier: "สไตล์สีชอล์กพาสเทลนุ่ม" },
  { id: "cinematic_style", label: "ฟิล์มภาพยนตร์", modifier: "สไตล์ฟิล์มภาพยนตร์ โทนสีมีมิติ" },
];

const PORTRAIT_LOOKS: Opt[] = [
  { id: "young-woman", label: "หญิงสาววัยรุ่น", modifier: "หญิงสาวรุ่นใหม่ รอยยิ้มสดใสเป็นธรรมชาติ" },
  { id: "young-man", label: "ชายหนุ่มวัยทำงาน", modifier: "ชายหนุ่มบุคลิกดี ทันสมัย มั่นใจ" },
  { id: "child", label: "เด็กน่ารัก", modifier: "เด็กน้อยไร้เดียงสา รอยยิ้มร่าเริง" },
  { id: "business", label: "นักธุรกิจมืออาชีพ", modifier: "นักธุรกิจลุคมืออาชีพ ดูน่าเชื่อถือ" },
  { id: "elderly", label: "ผู้สูงอายุอบอุ่น", modifier: "ผู้สูงอายุใบหน้าอบอุ่น มีริ้วรอยแห่งประสบการณ์" },
  { id: "athlete", label: "นักกีฬา", modifier: "นักกีฬาร่างกายฟิต พลังและความมั่นใจ" },
  { id: "artist", label: "ศิลปินสร้างสรรค์", modifier: "ศิลปินลุคครีเอทีฟ มีสไตล์เฉพาะตัว" },
  { id: "student", label: "นักเรียน/นักศึกษา", modifier: "นักเรียนนักศึกษา ดูสดใส เป็นมิตร" },
  { id: "model", label: "นางแบบ/นายแบบ", modifier: "ลุคแฟชั่นโมเดล ท่าทางสง่างาม" },
  { id: "chef", label: "เชฟ", modifier: "เชฟในชุดเครื่องแบบ ดูมืออาชีพ" },
  { id: "doctor", label: "แพทย์", modifier: "แพทย์ในชุดกาวน์ขาว น่าเชื่อถือ" },
  { id: "musician", label: "นักดนตรี", modifier: "นักดนตรีบนเวที แสงไฟอบอุ่น" },
  { id: "traveler", label: "นักเดินทาง", modifier: "นักเดินทางแบกเป้ บรรยากาศผจญภัย" },
  { id: "family", label: "ครอบครัว", modifier: "สมาชิกครอบครัวยิ้มอบอุ่นด้วยกัน" },
  { id: "couple", label: "คู่รัก", modifier: "คู่รักใกล้ชิด บรรยากาศโรแมนติก" },
];

const PORTRAIT_BACKGROUNDS: Opt[] = [
  { id: "office", label: "ออฟฟิศโมเดิร์น", modifier: "ฉากออฟฟิศกระจกโมเดิร์น แสงธรรมชาติ" },
  { id: "cafe", label: "คาเฟ่อบอุ่น", modifier: "ฉากคาเฟ่โทนไม้อบอุ่น ละมุนตา" },
  { id: "city", label: "วิวเมืองสตรีท", modifier: "ฉากกลางเมือง ถนนสตรีทสไตล์โมเดิร์น" },
  { id: "nature", label: "ธรรมชาติ", modifier: "ฉากธรรมชาติ ทุ่งหญ้าและต้นไม้เขียวขจี" },
  { id: "studio", label: "สตูดิโอ", modifier: "ฉากสตูดิโอภาพถ่ายแสงนุ่ม" },
  { id: "library", label: "ห้องสมุด", modifier: "ฉากห้องสมุดชั้นหนังสือสูง" },
  { id: "rooftop", label: "ดาดฟ้า", modifier: "ฉากดาดฟ้าเมืองพระอาทิตย์ตก" },
  { id: "beach", label: "ชายหาด", modifier: "ฉากชายหาดแสงทองยามเย็น" },
  { id: "museum", label: "พิพิธภัณฑ์", modifier: "ฉากโถงพิพิธภัณฑ์แสงนุ่ม" },
  { id: "garden", label: "สวนดอกไม้", modifier: "ฉากสวนดอกไม้บานสะพรั่ง" },
  { id: "subway", label: "สถานีรถไฟ", modifier: "ฉากสถานีรถไฟใต้ดินโมเดิร์น" },
  { id: "bedroom", label: "ห้องนอน", modifier: "ฉากห้องนอนมินิมอลแสงเช้า" },
  { id: "restaurant", label: "ร้านอาหาร", modifier: "ฉากร้านอาหารไฟอุ่น" },
  { id: "park", label: "สวนสาธารณะ", modifier: "ฉากสวนสาธารณะร่มรื่น" },
  { id: "night-city", label: "กลางคืนในเมือง", modifier: "ฉากกลางคืนไฟเมืองโบเก้" },
];

const PORTRAIT_CAMERA: Opt[] = [
  { id: "portrait", label: "Portrait ครึ่งตัว", modifier: "มุมกล้อง Portrait ถ่ายครึ่งตัว โบเก้เบลอฉากหลัง" },
  { id: "headshot", label: "Headshot", modifier: "มุมกล้อง Headshot โฟกัสใบหน้าและสายตาชัดเจน" },
  { id: "full", label: "เต็มตัว", modifier: "มุมกล้องเต็มตัว แสดงท่าทางและชุดที่สวมใส่" },
  { id: "closeup", label: "Close-up", modifier: "มุม Close-up เจาะรายละเอียดใบหน้า" },
  { id: "eyelevel", label: "ระดับสายตา", modifier: "มุมระดับสายตา เป็นธรรมชาติ" },
  { id: "low-angle", label: "มุมต่ำ", modifier: "มุมต่ำมองขึ้น ดูสง่างาม" },
  { id: "three-quarter", label: "สามส่วนสี่", modifier: "มุมสามส่วนสี่คลาสสิก" },
  { id: "profile", label: "ด้านข้าง", modifier: "มุมโปรไฟล์ด้านข้าง" },
  { id: "over-shoulder", label: "Over-shoulder", modifier: "มุมเหนือไหล่เล่าเรื่อง" },
  { id: "environmental", label: "Environmental", modifier: "Portrait แบบเห็นสภาพแวดล้อมกว้าง" },
  { id: "candid", label: "Candid", modifier: "มุมแคชชวลไม่ได้โพส ดูเป็นธรรมชาติ" },
  { id: "selfie", label: "Selfie", modifier: "มุมเซลฟี่ใกล้" },
  { id: "wide", label: "มุมกว้าง", modifier: "มุมกว้างเห็นบริบทโดยรอบ" },
  { id: "cinematic", label: "Cinematic", modifier: "มุมภาพยนตร์แสงเงาแน่น" },
  { id: "macro", label: "รายละเอียด", modifier: "เจาะรายละเอียดดวงตาหรือผิว" },
];

const LANDSCAPE_SCENERY: Opt[] = [
  { id: "sunset", label: "พระอาทิตย์ตกริมทะเล", modifier: "พระอาทิตย์ตกริมชายหาด ท้องฟ้าไล่เฉดสีส้มชมพูทอง" },
  {
    id: "mountain-mist",
    label: "ภูเขาเคล้าสายหมอก",
    modifier: "เทือกเขาสลับซับซ้อน ท่ามกลางหมอกยามเช้าตรู่",
  },
  { id: "forest", label: "ป่าเขียวขจี", modifier: "ป่าไม้อุดมสมบูรณ์ แสงแดดส่องผ่านยอดไม้ลงสู่ลำธาร" },
  { id: "meadow", label: "ทุ่งดอกไม้", modifier: "ทุ่งหญ้าและดอกไม้ป่าหลากสีสัน พริ้วไหว" },
  { id: "waterfall", label: "น้ำตก", modifier: "น้ำตกสูง พร้าวน้ำขาวใส โอบด้วยหินเขียว" },
  { id: "desert", label: "ทะเลทราย", modifier: "เนินทรายทะเลทราย แสงทองยามเย็น" },
  { id: "aurora", label: "แสงเหนือ", modifier: "ท้องฟ้าแสงเหนือเหนือทะเลสาบน้ำแข็ง" },
  { id: "lake", label: "ทะเลสาบกระจก", modifier: "ทะเลสาบเงาสะท้อนภูเขาใสราวกระจก" },
  { id: "canyon", label: "แกรนด์แคนยอน", modifier: "หุบผาหินแดงลึก แสงยามเย็น" },
  { id: "rice-field", label: "ทุ่งนาขั้นบันได", modifier: "ทุ่งนาขั้นบันไดเขียวขจี หมอกบาง" },
  { id: "cherry-blossom", label: "ซากุระ", modifier: "ทางเดินใต้ต้นซากุระบานสะพรั่ง" },
  { id: "tropical", label: "เกาะเขตร้อน", modifier: "หาดทรายขาวน้ำทะเลใส ต้นมะพร้าว" },
  { id: "snowy-peak", label: "ยอดเขาหิมะ", modifier: "ยอดเขาหิมะสูงตระหง่าน ฟ้าใส" },
  { id: "lavender", label: "ทุ่งลาเวนเดอร์", modifier: "ทุ่งลาเวนเดอร์ม่วงอ่อน แสงทอง" },
  { id: "stormy-sea", label: "ทะเลพายุ", modifier: "คลื่นทะเลพายุ ท้องฟ้าดราม่า" },
];

const LANDSCAPE_CAMERA: Opt[] = [
  { id: "panoramic", label: "Panoramic", modifier: "มุมมอง Panoramic กว้างไกลสุดลูกหูลูกตา" },
  { id: "drone", label: "Drone Aerial", modifier: "มุมมองจากโดรน Bird eye view มองจากฟากฟ้า" },
  { id: "eyelevel", label: "ระดับสายตา", modifier: "มุมมองระดับสายตา เสมือนยืนอยู่จริง" },
  { id: "wide", label: "มุมกว้าง", modifier: "มุมกว้างเห็นขอบฟ้าเต็มเฟรม" },
  { id: "low-angle", label: "มุมต่ำ", modifier: "มุมต่ำใกล้พื้น มองขึ้นสู่ท้องฟ้า" },
  { id: "birdseye", label: "Bird's-eye", modifier: "มุมจากฟ้าตรงลงมา" },
  { id: "telephoto", label: "Telephoto", modifier: "เลนส์เทเล บีบระยะ ทิวเขาทับชั้น" },
  { id: "ultrawide", label: "Ultra-wide", modifier: "เลนส์อัลตร้าวายด์ โค้งขอบฟ้าเล็กน้อย" },
  { id: "foreground", label: "มี Foreground", modifier: "มีดอกไม้/หินด้านหน้าสร้างมิติ" },
  { id: "leading-lines", label: "Leading Lines", modifier: "เส้นนำสายตา เช่น ถนนหรือแม่น้ำ" },
  { id: "symmetry", label: "สมมาตร", modifier: "องค์ประกอบสมมาตร สะท้อนน้ำ" },
  { id: "silhouette", label: "เงาดำ", modifier: "เงาดำตัวแบบกับท้องฟ้าสีทอง" },
  { id: "long-exposure", label: "Long Exposure", modifier: "เปิดหน้ากล้องนาน น้ำเนียนนุ่ม" },
  { id: "closeup", label: "รายละเอียดธรรมชาติ", modifier: "เจาะรายละเอียดใบไม้/น้ำค้าง" },
  { id: "cinematic", label: "Cinematic", modifier: "สัดส่วนภาพยนตร์ แสงเงาดราม่า" },
];

const GENERIC_TONES: Opt[] = [
  {
    id: "vibrant",
    label: "สีสดใส มีพลัง",
    character: "จัดจ้าน",
    modifier: "โทนสีสดใสจัดจ้าน มีพลังดึงดูดสายตา",
  },
  {
    id: "pastel",
    label: "พาสเทล ละมุน",
    character: "นุ่มนวล",
    modifier: "โทนสีพาสเทล นุ่มนวล อ่อนโยนสบายตา",
  },
  {
    id: "earth",
    label: "เอิร์ธโทน อบอุ่น",
    character: "ธรรมชาติ",
    modifier: "โทนสีเอิร์ธโทน ธรรมชาติ สบายใจ",
  },
  { id: "dark", label: "ดาร์ก โมเดิร์น", character: "หรูเข้ม", modifier: "โทนสีเข้มหรูหรา สไตล์ดาร์กโมเดิร์น" },
  {
    id: "neon",
    label: "นีออน ล้ำยุค",
    character: "เรืองแสง",
    modifier: "โทนสีนีออนเรืองแสง สไตล์ไซเบอร์โมเดิร์น",
  },
  { id: "monochrome", label: "ขาวดำ", character: "โมโน", modifier: "โทนขาวดำคลาสสิก คอนทราสต์ชัด" },
  { id: "warm", label: "วอร์มโทน", character: "อุ่น", modifier: "โทนอุ่นส้มทอง บรรยากาศอบอุ่น" },
  { id: "cool", label: "คูลโทน", character: "เย็น", modifier: "โทนเย็นฟ้าเขียว สงบตา" },
  { id: "muted", label: "มิวท์", character: "นุ่ม", modifier: "โทนสีมิวท์ลดความสด ดูพรีเมียม" },
  { id: "high-contrast", label: "คอนทราสต์สูง", character: "คม", modifier: "คอนทราสต์สูง ดำขาวชัด" },
  { id: "golden-hour", label: "Golden Hour", character: "ทอง", modifier: "แสงทองยามเย็นอุ่นตา" },
  { id: "blueprint", label: "บลูพรินต์", character: "เทคนิค", modifier: "โทนน้ำเงินแบบพิมพ์เขียว" },
  { id: "candy", label: "แคนดี้", character: "หวาน", modifier: "โทนสีลูกกวาดสดใส" },
  { id: "sepia", label: "ซีเปีย", character: "วินเทจ", modifier: "โทนซีเปียย้อนยุค" },
  { id: "ice", label: "ไอซ์", character: "เย็นจัด", modifier: "โทนน้ำแข็งขาวฟ้าเย็นเฉียบ" },
];

const GENERIC_BACKGROUNDS: Opt[] = [
  {
    id: "studio",
    label: "สตูดิโอมินิมอล",
    character: "คลีน",
    modifier: "ฉากหลังสตูดิโอคลีน สไตล์มินิมอล สะอาดตา",
  },
  {
    id: "nature",
    label: "ธรรมชาติกลางแจ้ง",
    character: "กลางแจ้ง",
    modifier: "ฉากธรรมชาติกลางแจ้ง มีแสงแดดสดใส",
  },
  {
    id: "room",
    label: "บรรยากาศในห้อง",
    character: "อินดอร์",
    modifier: "ฉากบรรยากาศภายในห้องตกแต่งสไตล์โมเดิร์น",
  },
  {
    id: "abstract",
    label: "แอบสแตรกต์ โบเก้",
    character: "โบเก้",
    modifier: "ฉากหลังแอบสแตรกต์พร้อมแสงโบเก้หลากสีนุ่มนวล",
  },
  { id: "city", label: "เมือง", character: "เออร์บัน", modifier: "ฉากเมืองสตรีทโมเดิร์น" },
  { id: "beach", label: "ชายหาด", character: "ทะเล", modifier: "ฉากชายหาดแสงธรรมชาติ" },
  { id: "office", label: "ออฟฟิศ", character: "ทำงาน", modifier: "ฉากออฟฟิศกระจกโมเดิร์น" },
  { id: "cafe", label: "คาเฟ่", character: "อบอุ่น", modifier: "ฉากคาเฟ่โทนไม้" },
  { id: "garden", label: "สวน", character: "เขียว", modifier: "ฉากสวนดอกไม้" },
  { id: "night-city", label: "กลางคืน", character: "ไนท์", modifier: "ฉากกลางคืนไฟเมืองโบเก้" },
  { id: "snow", label: "หิมะ", character: "ขาว", modifier: "ฉากหิมะขาวสะอาด" },
  { id: "library", label: "ห้องสมุด", character: "หนังสือ", modifier: "ฉากห้องสมุดชั้นหนังสือ" },
  { id: "kitchen", label: "ครัว", character: "บ้าน", modifier: "ฉากครัวบ้านแสงเช้า" },
  { id: "rooftop", label: "ดาดฟ้า", character: "สูง", modifier: "ฉากดาดฟ้าเมือง" },
  { id: "park", label: "สวนสาธารณะ", character: "พาร์ค", modifier: "ฉากสวนสาธารณะร่มรื่น" },
  {
    id: "mountain-peak",
    label: "ยอดเขา",
    character: "เอพิค",
    modifier: "ฉากยอดเขาสูง เมฆและท้องฟ้าดราม่า",
  },
  { id: "volcano", label: "ภูเขาไฟ", character: "ไฟ", modifier: "ฉากภูเขาไฟลาวาไหล ท้องฟ้าแดงควัน" },
  { id: "storm-sky", label: "ท้องฟ้าพายุ", character: "พายุ", modifier: "ฉากท้องฟ้าพายุฟ้าผ่า แสงเงาดราม่า" },
  { id: "cave", label: "ถ้ำคริสตัล", character: "ถ้ำ", modifier: "ฉากถ้ำคริสตัลเรืองแสง มืดลึกลับ" },
  {
    id: "ruins",
    label: "ซากโบราณ",
    character: "โบราณ",
    modifier: "ฉากซากปราสาทโบราณปกคลุมด้วยเถาวัลย์",
  },
  { id: "clouds", label: "เหนือเมฆ", character: "ฟ้า", modifier: "ฉากลอยเหนือทะเลเมฆ แสงพระอาทิตย์" },
];

const GENERIC_LIGHTING: Opt[] = [
  {
    id: "light_soft",
    label: "แสงนุ่มกระจาย",
    character: "นุ่ม",
    modifier: "แสงนุ่มกระจาย Soft diffused light ไม่มีเงาแข็ง",
  },
  {
    id: "light_rim",
    label: "Rim Light",
    character: "ขอบแสง",
    modifier: "Rim light ขอบแสงตัดตัวแบบจากพื้นหลัง ดราม่า",
  },
  {
    id: "light_godrays",
    label: "God Rays",
    character: "ลำแสง",
    modifier: "Volumetric god rays ลำแสงทะลุหมอก มีมิติอากาศ",
  },
  {
    id: "light_neon",
    label: "นีออนเรือง",
    character: "นีออน",
    modifier: "แสงนีออนเรืองสีตัดกัน Cyber glow",
  },
  {
    id: "light_golden",
    label: "แสงทอง",
    character: "ทอง",
    modifier: "Golden hour backlight แสงทองยามเย็นอุ่นตา",
  },
  {
    id: "light_moon",
    label: "แสงจันทร์",
    character: "จันทร์",
    modifier: "Moonlit cool blue light แสงจันทร์เย็นลึกลับ",
  },
  {
    id: "light_dramatic",
    label: "แสงละคร",
    character: "เข้ม",
    modifier: "Dramatic chiaroscuro แสงเงาคอนทราสต์สูงแบบจิตรกรรม",
  },
  {
    id: "light_overcast",
    label: "ท้องฟ้าครึ้ม",
    character: "นุ่มเทา",
    modifier: "Overcast soft sky light สม่ำเสมอ ไม่มีเงาแรง",
  },
  {
    id: "light_candle",
    label: "แสงเทียน",
    character: "อุ่นใกล้",
    modifier: "Candlelit warm intimate glow แสงเทียนอบอุ่นใกล้ตัว",
  },
  {
    id: "light_biolum",
    label: "เรืองชีวภาพ",
    character: "เรือง",
    modifier: "Bioluminescent glow แสงเรืองจากตัวแบบหรือสภาพแวดล้อม",
  },
  {
    id: "light_studio",
    label: "สตูดิโอ 3 จุด",
    character: "สตูดิโอ",
    modifier: "Three-point studio lighting คมชัดมืออาชีพ",
  },
  {
    id: "light_silhouette",
    label: "เงาดำย้อนแสง",
    character: "ซิลูเอต",
    modifier: "Backlit silhouette ตัวแบบเงาดำบนท้องฟ้าสีทอง",
  },
  {
    id: "light_spotlight",
    label: "สปอตไลต์",
    character: "จุดโฟกัส",
    modifier: "Hard spotlight วงแสงโฟกัสตัวแบบ พื้นหลังมืด",
  },
  {
    id: "light_under",
    label: "แสงจากด้านล่าง",
    character: "ล่างขึ้น",
    modifier: "Under-lighting จากด้านล่าง สร้างอารมณ์ลี้ลับหรือน่ากลัว",
  },
  {
    id: "light_magic",
    label: "แสงเวทมนตร์",
    character: "แมจิก",
    modifier: "Magical colored light shafts แสงสีวิเศษลอยในอากาศ",
  },
];

const GENERIC_ATMOSPHERE: Opt[] = [
  {
    id: "atm_epic",
    label: "เอพิคยิ่งใหญ่",
    character: "ยิ่งใหญ่",
    modifier: "บรรยากาศยิ่งใหญ่ epic majestic scale มีพลังตำนาน",
  },
  {
    id: "atm_whimsical",
    label: "ฝันๆ น่ารัก",
    character: "วิมสิคอล",
    modifier: "บรรยากาศ whimsical น่ารักชวนฝัน สดใส",
  },
  {
    id: "atm_dark",
    label: "มืดลึกลับ",
    character: "ดาร์ก",
    modifier: "บรรยากาศมืดลึกลับ ominous dark fantasy",
  },
  {
    id: "atm_serene",
    label: "สงบละมุน",
    character: "สงบ",
    modifier: "บรรยากาศสงบละมุน serene peaceful",
  },
  {
    id: "atm_chaotic",
    label: "วุ่นวายพลัง",
    character: "คาออส",
    modifier: "บรรยากาศพลังงานสูง chaotic dynamic energy",
  },
  {
    id: "atm_mysterious",
    label: "ลี้ลับ",
    character: "มิสเทอรี",
    modifier: "บรรยากาศลี้ลับมีหมอกและความไม่แน่นอน",
  },
  {
    id: "atm_heroic",
    label: "ฮีโรอิก",
    character: "กล้าหาญ",
    modifier: "บรรยากาศ heroic triumphant ความกล้าหาญ",
  },
  {
    id: "atm_melancholy",
    label: "เศร้าละเมียด",
    character: "เมลันโคลี",
    modifier: "บรรยากาศ melancholy อบอุ่นแต่เศร้าละเมียด",
  },
  {
    id: "atm_playful",
    label: "สนุกขี้เล่น",
    character: "เพลย์ฟูล",
    modifier: "บรรยากาศ playful สนุกขี้เล่น สีสันมีชีวิต",
  },
  {
    id: "atm_luxurious",
    label: "หรูพรีเมียม",
    character: "ลักซ์",
    modifier: "บรรยากาศหรูหราพรีเมียม refined luxurious",
  },
  {
    id: "atm_nostalgic",
    label: "ย้อนยุควินเทจ",
    character: "นอสเทลเจีย",
    modifier: "บรรยากาศ nostalgic vintage อบอุ่นย้อนเวลา",
  },
  {
    id: "atm_futuristic",
    label: "อนาคตล้ำ",
    character: "ฟิวเจอร์",
    modifier: "บรรยากาศ futuristic sci-fi ล้ำยุค",
  },
  {
    id: "atm_romantic",
    label: "โรแมนติก",
    character: "โรแมนซ์",
    modifier: "บรรยากาศโรแมนติกแสงอุ่นนุ่มนวล",
  },
  {
    id: "atm_tense",
    label: "ตึงเครียด",
    character: "เทนชัน",
    modifier: "บรรยากาศตึงเครียด cinematic tension ก่อนเหตุการณ์สำคัญ",
  },
  {
    id: "atm_sacred",
    label: "ศักดิ์สิทธิ์",
    character: "ศักดิ์สิทธิ์",
    modifier: "บรรยากาศศักดิ์สิทธิ์มีแสงศักดิ์สิทธิ์และพิธีกรรม",
  },
];

const GENERIC_CREATIVE: Opt[] = [
  {
    id: "cre_surreal",
    label: "เซอร์เรียล",
    character: "เหนือจริง",
    modifier: "แนวคิด surreal เหนือจริง องค์ประกอบฝันผสมความจริง",
  },
  {
    id: "cre_epic_scale",
    label: "สเกลมหึมา",
    character: "ไจแอนต์",
    modifier: "ตัวแบบขนาดมหึมาเทียบกับภูมิทัศน์เล็กจิ๋ว epic scale",
  },
  {
    id: "cre_chibi",
    label: "ชิบุ/น่ารัก",
    character: "ชิบุ",
    modifier: "สัดส่วน chibi น่ารักหัวโต โทนเบาสมอง",
  },
  {
    id: "cre_mythic",
    label: "ตำนานเทพนิยาย",
    character: "มิธิค",
    modifier: "แนวคิด mythic legendary ราวกับภาพประกอบตำนาน",
  },
  {
    id: "cre_cyber",
    label: "ไซเบอร์ฟิวชัน",
    character: "ไซเบอร์",
    modifier: "ผสม cyberpunk neon กับตัวแบบหลักอย่างลงตัว",
  },
  {
    id: "cre_paper",
    label: "เปเปอร์คราฟต์",
    character: "กระดาษ",
    modifier: "แนวคิด paper craft diorama ตัดกระดาษมีมิติ",
  },
  {
    id: "cre_double",
    label: "ดับเบิลเอ็กซ์โพเชอร์",
    character: "ซ้อนภาพ",
    modifier: "เทคนิค double exposure ซ้อนเงาตัวแบบกับทิวทัศน์",
  },
  {
    id: "cre_story",
    label: "ฉากเล่าเรื่อง",
    character: "สตอรี่",
    modifier: "จัดองค์ประกอบเล่าเรื่อง มี props และช่วงเวลาชัดเจน",
  },
  {
    id: "cre_minimal",
    label: "มินิมอลสัญลักษณ์",
    character: "มินิมอล",
    modifier: "แนวคิดมินิมอลเหลือแก่นสาระ สัญลักษณ์คมชัด",
  },
  {
    id: "cre_macro_world",
    label: "โลกมาโคร",
    character: "มาโคร",
    modifier: "มองโลกขนาดจิ๋วแบบ macro tilt-shift มีเวทมนตร์",
  },
  {
    id: "cre_ancient_future",
    label: "โบราณ×อนาคต",
    character: "ไฮบริด",
    modifier: "ผสมสถาปัตย์โบราณกับเทคโนโลยีอนาคตในเฟรมเดียว",
  },
  {
    id: "cre_emotion",
    label: "โฟกัสอารมณ์",
    character: "อารมณ์",
    modifier: "โฟกัสอารมณ์ตัวแบบเป็นศูนย์กลาง รายละเอียดฉากรอง",
  },
  {
    id: "cre_mirror",
    label: "โลกกระจกเงา",
    character: "มิเรอร์",
    modifier: "โลกกระจกสะท้อน สมมาตรหรือมิติคู่ขนาน",
  },
  {
    id: "cre_constellation",
    label: "กลุ่มดาวเวท",
    character: "คอสมิก",
    modifier: "ผสมกลุ่มดาว เนบิวลา และสัญลักษณ์จักรวาลเข้ากับตัวแบบ",
  },
  {
    id: "cre_festival",
    label: "เทศกาลแสงสี",
    character: "เฟสติวัล",
    modifier: "ฉากเทศกาลโคมไฟ พลุ หรือขบวนแสงสีฉลอง",
  },
];

const GENERIC_DETAIL: Opt[] = [
  {
    id: "det_hyper",
    label: "รายละเอียดสูงมาก",
    character: "ไฮเปอร์",
    modifier: "รายละเอียดพื้นผิวสูงมาก hyper-detailed crisp micro detail",
  },
  {
    id: "det_painterly",
    label: "ฝีแปรงหลวม",
    character: "เพนเทอร์ลี",
    modifier: "รายละเอียดแบบ painterly ฝีแปรงเห็นชัด ไม่ต้องโฟโต้รีอัล",
  },
  {
    id: "det_soft",
    label: "นุ่มเรียบง่าย",
    character: "ซอฟต์",
    modifier: "พื้นผิวนุ่มเรียบง่าย stylized soft forms",
  },
  {
    id: "det_scales",
    label: "เกล็ด/ผิวสัมผัส",
    character: "เท็กซ์เจอร์",
    modifier: "เน้นเกล็ด ผิวสัมผัส หรือแพทเทิร์นบนตัวแบบให้เด่น",
  },
  {
    id: "det_metallic",
    label: "โลหะเงาวาว",
    character: "เมทัล",
    modifier: "วัสดุโลหะเงาสะท้อน metallic reflections",
  },
  {
    id: "det_matte",
    label: "แมตต์ดิน/เซรามิก",
    character: "แมตต์",
    modifier: "พื้นผิวแมตต์ดินเหนียวหรือเซรามิก ไม่เงาจัด",
  },
  { id: "det_glass", label: "แก้ว/คริสตัล", character: "ใส", modifier: "วัสดุแก้วหรือคริสตัลโปร่งแสงหักเห" },
  { id: "det_fabric", label: "ผ้าพลิ้ว", character: "ผ้า", modifier: "เน้นผ้าพลิ้ว ริ้วและรอยพับอย่างประณีต" },
  {
    id: "det_weathered",
    label: "เก่าคร่ำ/สึกกร่อน",
    character: "เวเธอร์",
    modifier: "พื้นผิวเก่าคร่ำ weathered worn age detail",
  },
  {
    id: "det_glow_edge",
    label: "ขอบเรืองแสง",
    character: "เอาท์ไลน์",
    modifier: "ขอบและไฮไลต์เรืองแสงเล็กน้อย ให้ดูมีพลัง",
  },
  {
    id: "det_ember",
    label: "เถ้าถ่าน/สะเก็ดไฟ",
    character: "ไฟ",
    modifier: "มีสะเก็ดไฟ เถ้าถ่านลอย และรอยไหม้เล็กน้อย",
  },
  { id: "det_frost", label: "น้ำแข็งเกาะ", character: "ฟรอสต์", modifier: "ผิวมีน้ำแข็งเกาะ ผลึกน้ำค้างแข็ง" },
  {
    id: "det_floral",
    label: "ลายดอกไม้พรรณไม้",
    character: "ฟลอรัล",
    modifier: "มีลายดอกไม้ เถาวัลย์ หรือพรรณไม้ประดับตัวแบบ",
  },
  {
    id: "det_rune",
    label: "อักขระรูน",
    character: "รูน",
    modifier: "มีอักขระรูนหรือสัญลักษณ์โบราณเรืองแสงบนผิว",
  },
  {
    id: "det_inksplash",
    label: "สาดหมึก",
    character: "หมึก",
    modifier: "เอฟเฟกต์สาดหมึกหรือเส้นพู่กันพริ้วรอบตัวแบบ",
  },
];

const GENERIC_WEATHER: Opt[] = [
  { id: "wx_dawn", label: "รุ่งอรุณหมอก", character: "รุ่ง", modifier: "ช่วงรุ่งอรุณมีหมอกบาง แสงเย็นชมพู" },
  {
    id: "wx_sunset",
    label: "พระอาทิตย์ตก",
    character: "เย็น",
    modifier: "ช่วงพระอาทิตย์ตกท้องฟ้าไล่ส้มชมพูทอง",
  },
  {
    id: "wx_midnight",
    label: "เที่ยงคืน",
    character: "ดึก",
    modifier: "ช่วงเที่ยงคืนท้องฟ้ามืดดาวและแสงจันทร์",
  },
  { id: "wx_rain", label: "ฝนพรำ", character: "ฝน", modifier: "บรรยากาศฝนพรำพื้นเปียกสะท้อนแสง" },
  { id: "wx_storm", label: "พายุฟ้าคะนอง", character: "พายุ", modifier: "พายุฟ้าคะนอง ลมแรง ฟ้าผ่าไกล" },
  { id: "wx_snow", label: "หิมะโปรย", character: "หิมะ", modifier: "หิมะโปรยเบาๆ อากาศเย็นสะอาด" },
  { id: "wx_fog", label: "หมอกลึก", character: "หมอก", modifier: "หมอกลึกล้อมตัวแบบ ระยะใกล้ชัดไกลจาง" },
  { id: "wx_clear", label: "ฟ้าใสแดดจัด", character: "ใส", modifier: "ท้องฟ้าใสแดดจัด เงาคม" },
  {
    id: "wx_autumn",
    label: "ลมใบไม้ร่วง",
    character: "ฤดูใบไม้ร่วง",
    modifier: "อากาศฤดูใบไม้ร่วงใบส้มทองลอย",
  },
  {
    id: "wx_heat",
    label: "คลื่นความร้อน",
    character: "ร้อน",
    modifier: "คลื่นความร้อนเหนือพื้น แสงจ้าแห้งผาก",
  },
  {
    id: "wx_bluehour",
    label: "บลูอาวร์",
    character: "ฟ้าเย็น",
    modifier: "ช่วง blue hour หลังพระอาทิตย์ตก ท้องฟ้าน้ำเงินม่วง",
  },
  {
    id: "wx_eclipse",
    label: "สุริยุปราคา",
    character: "อุปราคา",
    modifier: "บรรยากาศสุริยุปราคา แสงสลัวทองแดงลึกลับ",
  },
  { id: "wx_aurora", label: "แสงเหนือ", character: "ออโรร่า", modifier: "ท้องฟ้าแสงเหนือเขียวม่วงพริ้วไหว" },
  {
    id: "wx_sandstorm",
    label: "พายุทราย",
    character: "ทราย",
    modifier: "พายุทรายสีทอง ทัศนวิสัยต่ำ มีพลัง",
  },
  {
    id: "wx_monsoon",
    label: "มรสุมเขตร้อน",
    character: "มรสุม",
    modifier: "มรสุมเขตร้อน เมฆดำหนา ฝนหนักชื้น",
  },
];

const GENERIC_COMPOSITION: Opt[] = [
  {
    id: "comp_centered",
    label: "กลางเฟรม",
    character: "กลาง",
    modifier: "จัดตัวแบบกลางเฟรม สมมาตร ชัดเจน",
  },
  {
    id: "comp_thirds",
    label: "กฎสามส่วน",
    character: "สามส่วน",
    modifier: "Rule of thirds วางตัวแบบบนจุดตัด",
  },
  {
    id: "comp_wide_est",
    label: "ภาพกว้างตั้งเรื่อง",
    character: "กว้าง",
    modifier: "Wide establishing shot ตัวแบบเล็กในภูมิทัศน์กว้าง",
  },
  {
    id: "comp_close_detail",
    label: "เจาะรายละเอียด",
    character: "ใกล้",
    modifier: "เฟรมใกล้เจาะรายละเอียดผิวตาหรือพื้นผิวสำคัญ",
  },
  { id: "comp_dutch", label: "มุมเฉียง", character: "เฉียง", modifier: "Dutch angle เฟรมเฉียงมีพลัง" },
  {
    id: "comp_leading",
    label: "เส้นนำสายตา",
    character: "นำสายตา",
    modifier: "Leading lines พาสายตาไปที่ตัวแบบ",
  },
  {
    id: "comp_frame",
    label: "กรอบในกรอบ",
    character: "กรอบ",
    modifier: "Frame within frame ซุ้มประตูหรือซุ้มใบไม้",
  },
  {
    id: "comp_negative",
    label: "พื้นที่ว่าง",
    character: "ว่าง",
    modifier: "ตัวแบบเล็กกับ negative space กว้าง",
  },
  {
    id: "comp_crowd",
    label: "แน่นทั้งเฟรม",
    character: "แน่น",
    modifier: "องค์ประกอบแน่นเต็มเฟรม งานเทศกาลหรือฝูงชน",
  },
  { id: "comp_low_hero", label: "มุมต่ำฮีโร่", character: "ฮีโร่", modifier: "มุมต่ำมองขึ้น ตัวแบบดูเป็นฮีโร่" },
  {
    id: "comp_overhead",
    label: "มุมบน",
    character: "บน",
    modifier: "Overhead flat lay หรือมองลงมาตรงๆ",
  },
  {
    id: "comp_profile",
    label: "ซิลูเอตด้านข้าง",
    character: "โปรไฟล์",
    modifier: "ซิลูเอตด้านข้างตัดกับท้องฟ้า",
  },
  {
    id: "comp_diagonal",
    label: "เส้นทแยง",
    character: "ทแยง",
    modifier: "องค์ประกอบเส้นทแยงมีพลังเคลื่อนไหว",
  },
  { id: "comp_mirror", label: "เงาสะท้อน", character: "สะท้อน", modifier: "เงาสะท้อนสมมาตรบนน้ำนิ่ง" },
  {
    id: "comp_depth",
    label: "ชั้นความลึก",
    character: "ลึก",
    modifier: "ชัดเจนทั้ง foreground midground background",
  },
];

function dim(id: string, title: string, options: Opt[], hint?: string): OptionSetDimension {
  return { id, title, hint, options };
}

export function createCatDimensions(): OptionSetDimension[] {
  return [
    dim("color", "สี", CAT_COLORS),
    dim("breed", "สายพันธุ์", CAT_BREEDS),
    dim("background", "พื้นหลัง", PET_BACKGROUNDS),
    dim("camera", "มุมกล้อง", CAMERA_ANGLES),
    dim("style", "สไตล์ภาพ", ART_STYLES),
  ];
}

export function createDogDimensions(): OptionSetDimension[] {
  return [
    dim("breed", "สายพันธุ์", DOG_BREEDS),
    dim("color", "สี", DOG_COLORS),
    dim("background", "พื้นหลัง", PET_BACKGROUNDS),
    dim("camera", "มุมกล้อง", CAMERA_ANGLES),
    dim("style", "สไตล์ภาพ", ART_STYLES),
  ];
}

export function createPortraitDimensions(): OptionSetDimension[] {
  return [
    dim("look", "ลักษณะ", PORTRAIT_LOOKS),
    dim("background", "พื้นหลัง", PORTRAIT_BACKGROUNDS),
    dim("camera", "มุมกล้อง", PORTRAIT_CAMERA),
    dim("style", "สไตล์ภาพ", ART_STYLES),
  ];
}

export function createLandscapeDimensions(): OptionSetDimension[] {
  return [
    dim("scenery", "บรรยากาศ", LANDSCAPE_SCENERY),
    dim("camera", "มุมกล้อง", LANDSCAPE_CAMERA),
    dim("style", "สไตล์ภาพ", ART_STYLES),
  ];
}

export function createGenericOptionSetDimensions(): OptionSetDimension[] {
  return [
    dim("atmosphere", "อารมณ์ภาพ", GENERIC_ATMOSPHERE, "ความรู้สึกหลักของภาพ"),
    dim("creative", "ทวิสต์สร้างสรรค์", GENERIC_CREATIVE, "แนวคิดเสริมที่ทำให้ prompt มีชีวิต"),
    dim("color", "โทนสี", GENERIC_TONES, "ขั้วสีของภาพ"),
    dim("lighting", "แสง", GENERIC_LIGHTING, "ทิศทางและคุณภาพแสง"),
    dim("background", "พื้นหลัง", GENERIC_BACKGROUNDS, "ฉากที่รองรับตัวแบบ"),
    dim("weather", "เวลา/อากาศ", GENERIC_WEATHER, "ช่วงวันและสภาพอากาศ"),
    dim("detail", "รายละเอียดผิว", GENERIC_DETAIL, "ความละเอียดและวัสดุผิว"),
    dim("composition", "องค์ประกอบ", GENERIC_COMPOSITION, "การจัดวางในเฟรม"),
    dim("camera", "มุมกล้อง", CAMERA_ANGLES, "มุมมองและการจัดเฟรม"),
    dim("style", "สไตล์ภาพ", ART_STYLES, "ภาษาภาพหลัก"),
  ];
}

/** All option ids used by subject/generic helpers — for thumb coverage. */
export function listAllSubjectOptionIds(): string[] {
  const dims = [
    ...createCatDimensions(),
    ...createDogDimensions(),
    ...createPortraitDimensions(),
    ...createLandscapeDimensions(),
    ...createGenericOptionSetDimensions(),
  ];
  return [...new Set(dims.flatMap((d) => d.options.map((o) => o.id)))];
}
