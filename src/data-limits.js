export const MAX_DATA_FIELDS=150;
export function assertDataFields(fields){
 if(fields.length>MAX_DATA_FIELDS)throw new Error(`Điền hàng loạt và AI hỗ trợ tối đa ${MAX_DATA_FIELDS} trường. Bớt trường hoặc chia bộ thiết lập trước khi tiếp tục.`);
}
