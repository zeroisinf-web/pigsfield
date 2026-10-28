from pathlib import Path
from PIL import Image,ImageDraw,ImageFont,ImageEnhance
ROOT=Path(__file__).resolve().parents[1]
def font(size,bold=False):return ImageFont.truetype('C:/Windows/Fonts/arialbd.ttf' if bold else 'C:/Windows/Fonts/arial.ttf',size)
for slug,title,count,art in [('watch','Learning, worth watching.','2,176 discoveries','nukkad-naatak'),('watch-films','Movies & shows','1,698 titles','nukkad-naatak'),('watch-apps','Games & apps','269 platforms','scratch'),('watch-channels','Channels','209 creators','ted-ed')]:
    im=Image.new('RGB',(1200,630),'#101112')
    picture=Image.open(ROOT/f'assets/pigbang/{art}.webp').convert('RGB')
    ratio=max(1200/picture.width,630/picture.height)
    picture=picture.resize((int(picture.width*ratio),int(picture.height*ratio)))
    x=(picture.width-1200)//2;y=(picture.height-630)//2
    picture=picture.crop((x,y,x+1200,y+630));picture=ImageEnhance.Brightness(picture).enhance(.28)
    im.paste(picture,(0,0));d=ImageDraw.Draw(im)
    d.text((65,55),'PIGBANG',font=font(38,True),fill='#f4f1ea')
    d.text((65,111),'EDUCATIONAL OTT',font=font(15,True),fill='#ff6455')
    lines=['Learning, worth','watching.'] if slug=='watch' else [title]
    for i,line in enumerate(lines):d.text((60,225+i*85),line,font=font(75,True),fill='#f4f1ea')
    d.rounded_rectangle((65,478,350,527),radius=5,fill='#ed4c43')
    d.text((86,491),count,font=font(24,True),fill='white')
    d.text((65,568),'CLASS  /  SUBJECT  /  FREE & PAID',font=font(16),fill='#d7dbd4')
    d.text((940,568),'pigsfield.com',font=font(17),fill='#d7dbd4')
    im.save(ROOT/f'assets/og/{slug}.jpg',quality=88,optimize=True)
