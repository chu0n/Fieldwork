export function rulePresentation(rule){
  if(rule.generic)return{label:rule.constants.length?'Code · chuỗi dữ liệu':'Text · văn bản',icon:rule.constants.length?'file-code-2':'file-text',hint:rule.constants.length?'Chỉ sửa chuỗi cần thay; mã không chạy trong ứng dụng.':'Nhập nội dung cần thay thế.'};
  const kinds={
    '0':['Text','text-cursor-input','Điền chữ, email, số hoặc ngày. Giữ số 0 ở đầu nếu có.'],
    '1':['Password','key-round','Nội dung được che; giá trị vẫn có trong file xuất.'],
    '2':['Select','list-filter','Theo tài liệu Lightning: "nội dung" / "value", hoặc chỉ số từ 0; dùng | cho nhiều lựa chọn.'],
    '3':['Checkbox / Radio','square-check','Theo tài liệu Lightning: 1 = chọn, 0 = bỏ chọn; chuỗi 0100 chọn mục thứ hai của nhóm.'],
    '4':['JavaScript','file-code-2','Lightning thực thi đoạn mã này trên form; ứng dụng chỉ chỉnh và kiểm tra nội dung.'],
    '5':['AUTOFILL · Chạy profile','layers-3','Value là ID profile cần thực thi.'],
    '6':['CLICK · Bấm phần tử','mouse-pointer-2','Name là CSS selector hoặc XPath của phần tử cần bấm.'],
    '7':['DISPATCH · Gửi sự kiện','command','Name là đích; Value là tên sự kiện.'],
    '8':['OPEN · Mở trang','external-link','Value chứa URL và tùy chọn đích mở trang.'],
    '9':['RELOAD · Tải lại','rotate-ccw','Name là phần tử cần chờ; Value là khoảng thời gian theo cú pháp phiên bản Lightning.'],
    '10':['SCRAPE · Lấy nội dung','copy','Name là đích; Value là tên biến nhận nội dung.'],
    '11':['STYLE · CSS','pencil','Value là mã CSS sẽ áp dụng lên trang.'],
    '12':['WAIT · Chờ','clock-3','Giữ đúng cột và đơn vị trong template. Không tự đổi tham số giữa các phiên bản.'],
  };
  let [label,icon,hint]=kinds[rule.type]||[`Type ${rule.type} · Chưa nhận diện`,'circle-help','Giữ nguyên dữ liệu và kiểm tra loại rule trên phiên bản Lightning đang dùng.'];
  if(rule.type==='3'){
    const selector=rule.selector||'';
    if(/(?:@?(?:type|role)\s*=\s*['"]?radio\b)/i.test(selector))label='Radio · Chọn một';
    else if(/(?:@?(?:type|role)\s*=\s*['"]?checkbox\b)/i.test(selector))label='Checkbox · Ô tích';
  }
  return{label,icon,hint};
}
export function readableRuleTitle(rule){
  const title=rule.title||'';
  if(!title||title===rule.id||/^Chưa (?:đặt tên|có)/i.test(title))return '';
  return title;
}
