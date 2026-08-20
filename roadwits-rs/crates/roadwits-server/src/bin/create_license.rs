//! Консольная утилита для создания лицензии напрямую в БД, в обход gRPC —
//! аналог scripts/create_admin.py и scripts/create_user.py (объединены в один
//! бинарь, так как отличаются только дефолтным user_type).
//!
//! Использование:
//!   create_license --user-type admin --email admin@roadwits.app --days 3650
//!   create_license --user-type student --days 30 --max-devices 2
//!
//! DATABASE_URL берется из окружения/.env, как и в сервере.

use roadwits_server::config::Config;
use roadwits_server::db;
use roadwits_server::db::models::UserType;
use roadwits_server::service::license_service;

struct Args {
    user_type: UserType,
    email: Option<String>,
    first_name: Option<String>,
    last_name: Option<String>,
    days: i32,
    max_devices: i32,
}

fn parse_args() -> Result<Args, String> {
    let mut user_type = UserType::Student;
    let mut email = None;
    let mut first_name = None;
    let mut last_name = None;
    let mut days = 30;
    let mut max_devices = 1;

    let mut it = std::env::args().skip(1);
    while let Some(flag) = it.next() {
        let mut next = || it.next().ok_or_else(|| format!("{flag} требует значение"));
        match flag.as_str() {
            "--user-type" => {
                let v = next()?;
                user_type = UserType::parse(&v)
                    .ok_or_else(|| format!("неизвестный user-type: {v} (admin|editor|student)"))?;
            }
            "--email" => email = Some(next()?),
            "--first-name" => first_name = Some(next()?),
            "--last-name" => last_name = Some(next()?),
            "--days" => {
                let v = next()?;
                days = v.parse().map_err(|_| format!("--days должен быть числом: {v}"))?;
            }
            "--max-devices" => {
                let v = next()?;
                max_devices = v.parse().map_err(|_| format!("--max-devices должен быть числом: {v}"))?;
            }
            "-h" | "--help" => {
                print_help();
                std::process::exit(0);
            }
            other => return Err(format!("неизвестный флаг: {other}")),
        }
    }

    Ok(Args {
        user_type,
        email,
        first_name,
        last_name,
        days,
        max_devices,
    })
}

fn print_help() {
    println!(
        r#"create_license — создать лицензию напрямую в БД

ФЛАГИ:
  --user-type <admin|editor|student>   по умолчанию: student
  --email <email>
  --first-name <имя>
  --last-name <фамилия>
  --days <N>                            срок лицензии в днях, по умолчанию: 30
  --max-devices <N>                     1..3, по умолчанию: 1

DATABASE_URL берется из окружения или .env, как и у сервера."#
    );
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args = match parse_args() {
        Ok(a) => a,
        Err(e) => {
            eprintln!("Ошибка: {e}\n");
            print_help();
            std::process::exit(1);
        }
    };

    let cfg = Config::from_env();
    let pool = db::connect(&cfg.database_url).await?;

    let license = license_service::create_license(
        &pool,
        args.days,
        args.email.as_deref(),
        args.first_name.as_deref(),
        args.last_name.as_deref(),
        args.user_type,
        serde_json::json!({}),
        args.max_devices.clamp(1, 3),
    )
    .await?;

    println!("Лицензия создана:");
    println!("  id:           {}", license.id);
    println!("  product_key:  {}", license.product_key);
    println!("  user_type:    {}", license.user_type.as_str());
    println!("  license_until:{}", license.license_until);
    if let Some(email) = &license.email {
        println!("  email:        {email}");
    }

    Ok(())
}
