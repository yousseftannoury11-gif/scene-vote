"""Build data/bible.js from the public-domain Arabic Van Dyck (SVD) JSON.

Source: https://raw.githubusercontent.com/koo1140/bible/master/json/ar_svd.json
Usage:  python3 tools/build_bible.py path/to/ar_svd.json
"""
import json
import pathlib
import sys

# (id, Arabic name, short Arabic abbreviation) in source order
BOOKS = [
    ("gn", "التكوين", "تك"), ("ex", "الخروج", "خر"), ("lv", "الأحبار", "أح"),
    ("nm", "العدد", "عد"), ("dt", "تثنية الاشتراع", "تث"), ("js", "يشوع", "يش"),
    ("jud", "القضاة", "قض"), ("rt", "راعوث", "را"), ("1sm", "صموئيل الأول", "1صم"),
    ("2sm", "صموئيل الثاني", "2صم"), ("1kgs", "الملوك الأول", "1مل"),
    ("2kgs", "الملوك الثاني", "2مل"), ("1ch", "أخبار الأيام الأول", "1أخ"),
    ("2ch", "أخبار الأيام الثاني", "2أخ"), ("ezr", "عزرا", "عز"), ("ne", "نحميا", "نح"),
    ("et", "أستير", "أس"), ("job", "أيوب", "أي"), ("ps", "المزامير", "مز"),
    ("prv", "الأمثال", "أم"), ("ec", "الجامعة", "جا"), ("so", "نشيد الأناشيد", "نش"),
    ("is", "أشعيا", "أش"), ("jr", "إرميا", "إر"), ("lm", "المراثي", "مرا"),
    ("ez", "حزقيال", "حز"), ("dn", "دانيال", "دا"), ("ho", "هوشع", "هو"),
    ("jl", "يوئيل", "يوء"), ("am", "عاموس", "عا"), ("ob", "عوبديا", "عو"),
    ("jn", "يونان", "يون"), ("mi", "ميخا", "مي"), ("na", "ناحوم", "نا"),
    ("hk", "حبقوق", "حب"), ("zp", "صفنيا", "صف"), ("hg", "حجاي", "حج"),
    ("zc", "زكريا", "زك"), ("ml", "ملاخي", "ملا"),
    ("mt", "متى", "مت"), ("mk", "مرقس", "مر"), ("lk", "لوقا", "لو"), ("jo", "يوحنا", "يو"),
    ("act", "أعمال الرسل", "أع"), ("rm", "رومة", "روم"), ("1co", "قورنتس الأولى", "1قور"),
    ("2co", "قورنتس الثانية", "2قور"), ("gl", "غلاطية", "غل"), ("eph", "أفسس", "أف"),
    ("ph", "فيلبي", "فل"), ("cl", "قولسي", "قول"), ("1ts", "تسالونيقي الأولى", "1تس"),
    ("2ts", "تسالونيقي الثانية", "2تس"), ("1tm", "طيموتاوس الأولى", "1طيم"),
    ("2tm", "طيموتاوس الثانية", "2طيم"), ("tt", "طيطس", "طي"), ("phm", "فيلمون", "فلم"),
    ("hb", "العبرانيين", "عب"), ("jm", "يعقوب", "يع"), ("1pe", "بطرس الأولى", "1بط"),
    ("2pe", "بطرس الثانية", "2بط"), ("1jo", "يوحنا الأولى", "1يو"),
    ("2jo", "يوحنا الثانية", "2يو"), ("3jo", "يوحنا الثالثة", "3يو"),
    ("jd", "يهوذا", "يه"), ("re", "رؤيا يوحنا", "رؤ"),
]


def clean(s):
    for ch in ("‎", "‏", "﻿"):
        s = s.replace(ch, "")
    return " ".join(s.split())


def main(src):
    data = json.loads(pathlib.Path(src).read_text(encoding="utf-8-sig"))
    assert len(data) == len(BOOKS) == 66
    out = []
    for i, (book, (bid, name, ab)) in enumerate(zip(data, BOOKS)):
        assert book["abbrev"] == bid, (book["abbrev"], bid)
        out.append({
            "id": bid, "name": name, "ab": ab, "t": "OT" if i < 39 else "NT",
            "ch": [[clean(v) for v in c] for c in book["chapters"]],
        })
    dest = pathlib.Path(__file__).resolve().parent.parent / "data" / "bible.js"
    body = json.dumps(out, ensure_ascii=False, separators=(",", ":"))
    dest.write_text(
        "// الكتاب المقدس - ترجمة فاندايك (ملك عام). مولَّد بواسطة tools/build_bible.py\n"
        "window.BIBLE=" + body + ";\n", encoding="utf-8")
    print("wrote", dest, dest.stat().st_size, "bytes")


if __name__ == "__main__":
    main(sys.argv[1])
