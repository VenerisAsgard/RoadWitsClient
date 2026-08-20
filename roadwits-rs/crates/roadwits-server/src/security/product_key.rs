use rand::Rng;

// Исключаем визуально похожие символы: 0/O, 1/I/L — как в оригинале
// (app/utils/product_key.py).
const ALPHABET: &[u8] = b"ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const GROUP_LENGTH: usize = 6;
const GROUP_COUNT: usize = 4;

/// Генерирует Product Key вида A7P91D_QK28JW_P2T9LA_X91KFE.
/// 4 группы по 6 символов, итого 24 значащих символа + 3 разделителя.
pub fn generate_product_key() -> String {
    let mut rng = rand::thread_rng();
    (0..GROUP_COUNT)
        .map(|_| {
            (0..GROUP_LENGTH)
                .map(|_| ALPHABET[rng.gen_range(0..ALPHABET.len())] as char)
                .collect::<String>()
        })
        .collect::<Vec<_>>()
        .join("_")
}
