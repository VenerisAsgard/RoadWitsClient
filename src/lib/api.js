export const API =
"http://localhost:8000";



export async function apiFetch(
    url,
    token
){

    return await fetch(

        API + url,

        {

        headers:{

            Authorization:
            `Bearer ${token}`

        }

        }

    );

}
