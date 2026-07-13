use reqwest::Client;


pub async fn register_device(

    token:String,

    fingerprint:String

)
->Result<(),String>{


    let client =
        Client::new();



    let response =
        client
        .post(
        "http://localhost:8000/devices/register"
        )


        .bearer_auth(token)


        .json(
            &serde_json::json!({

                "fingerprint": fingerprint,

                "name":"main pc"

            })
        )


        .send()

        .await

        .map_err(
            |e|e.to_string()
        )?;



    if response.status().is_success(){

        Ok(())

    }
    else{

        Err(
            response
            .text()
            .await
            .unwrap()
        )

    }

}
