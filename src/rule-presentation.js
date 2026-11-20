import { t } from './locale.js';
export function rulePresentation(rule){
  if(rule.generic)return{label:rule.constants.length?t("Code · chuỗi dữ liệu","Code · text value"):t("Text · văn bản","Text"),icon:rule.constants.length?'file-code-2':'file-text',hint:rule.constants.length?t("Chỉ sửa chuỗi cần thay; mã không chạy trong ứng dụng.","Edit the selected string. Code is treated as text here."):t("Nhập nội dung cần thay thế.","Enter the new value.")};
  const kinds={
    '0':['Text','text-cursor-input',t("Điền chữ, email, số hoặc ngày. Giữ số 0 ở đầu nếu có.","Enter text, email, a number, or a date. Preserve any leading zeroes.")],
    '1':['Password','key-round',t("Nội dung được che; giá trị vẫn có trong file xuất.","The editor masks the value. The exported file contains it.")],
    '2':['Select','list-filter','Theo tài liệu Lightning: "nội dung" / "value", hoặc chỉ số từ 0; dùng | cho nhiều lựa chọn.'],
    '3':['Checkbox / Radio','square-check',t("Theo tài liệu Lightning: 1 = chọn, 0 = bỏ chọn; chuỗi 0100 chọn mục thứ hai của nhóm.","In Lightning, 1 checks an option and 0 clears it. 0100 selects the second option in a group.")],
    '4':['JavaScript','file-code-2',t("Lightning thực thi đoạn mã này trên form; ứng dụng chỉ chỉnh và kiểm tra nội dung.","Lightning runs this script on the form. Fieldwork edits and checks it as text.")],
    '5':[t("AUTOFILL · Chạy profile","AUTOFILL · Run profile"),'layers-3',t("Value là ID profile cần thực thi.","Value is the ID of the profile to run.")],
    '6':[t("CLICK · Bấm phần tử","CLICK · Click element"),'mouse-pointer-2',t("Name là CSS selector hoặc XPath của phần tử cần bấm.","Name is the CSS selector or XPath for the element.")],
    '7':[t("DISPATCH · Gửi sự kiện","DISPATCH · Send event"),'command',t("Name là đích; Value là tên sự kiện.","Name is the target. Value is the event name.")],
    '8':[t("OPEN · Mở trang","OPEN · Open page"),'external-link',t("Value chứa URL và tùy chọn đích mở trang.","Value contains the URL and its opening options.")],
    '9':[t("RELOAD · Tải lại","RELOAD · Reload"),'rotate-ccw',t("Name là phần tử cần chờ; Value là khoảng thời gian theo cú pháp phiên bản Lightning.","Name is the element to wait for. Value is the delay in your Lightning version’s format.")],
    '10':[t("SCRAPE · Lấy nội dung","SCRAPE · Read value"),'copy',t("Name là đích; Value là tên biến nhận nội dung.","Name is the target. Value is the variable that receives the result.")],
    '11':['STYLE · CSS','pencil',t("Value là mã CSS sẽ áp dụng lên trang.","Value is the CSS to apply to the page.")],
    '12':[t("WAIT · Chờ","WAIT · Wait"),'clock-3',t("Giữ đúng cột và đơn vị trong template. Không tự đổi tham số giữa các phiên bản.","Use the column and time unit expected by your Lightning version.")],
  };
  let [label,icon,hint]=kinds[rule.type]||[`Type ${rule.type} · ${t("Chưa nhận diện","Unknown")}`,'circle-help',t("Giữ nguyên dữ liệu và kiểm tra loại rule trên phiên bản Lightning đang dùng.","Check the rule type against your Lightning version.")];
  if(rule.type==='3'){
    const selector=rule.selector||'';
    if(/(?:@?(?:type|role)\s*=\s*['"]?radio\b)/i.test(selector))label=t("Radio · Chọn một","Radio · Single choice");
    else if(/(?:@?(?:type|role)\s*=\s*['"]?checkbox\b)/i.test(selector))label=t("Checkbox · Ô tích","Checkbox · Toggle");
  }
  return{label,icon,hint};
}
export function readableRuleTitle(rule){
  const title=rule.title||'';
  if(!title||title===rule.id||/^Chưa (?:đặt tên|có)/i.test(title))return '';
  return title;
}
