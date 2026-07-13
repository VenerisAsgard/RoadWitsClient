use sha2::{Sha256,Digest};


pub fn get_fingerprint()->String{


    let machine_id =
        machine_uid::get()
        .unwrap_or(
            "unknown".to_string()
        );


    let mut hasher =
        Sha256::new();


    hasher.update(
        machine_id.as_bytes()
    );


    let result =
        hasher.finalize();


    hex::encode(result)

}
