/**
 * Set data options
 * @param data Data
 * @param field Field
 * @param value Value
 * @returns Data
 */
export function setOptions(data: any, field: any, value: any) {
    let result: any = null;
    if (data && field) {
        const keys = field.split('.');
        result = data;
        for (let i = 0; i < keys.length - 1; i++) {
            const key = keys[i];
            if (key === 'L' && Array.isArray(result)) {
                result = result[result.length - 1];
            } else {
                result = result[key];
            }
        }
        result[keys[keys.length - 1]] = value;
    }
    return result;
}
