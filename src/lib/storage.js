import { invoke } from "@tauri-apps/api/core";
import { Store } from "@tauri-apps/plugin-store";


let store;


async function getStore(){

    if(!store){

        store = await Store.load(
            "auth.json"
        );

    }

    return store;

}



export async function saveToken(token){

    const s = await getStore();

    await s.set(
        "token",
        token
    );

    await s.save();

}



export async function getToken(){

    const s = await getStore();

    return await s.get(
        "token"
    );

}



export async function removeToken(){

    const s = await getStore();


    await s.delete(
        "token"
    );


    await s.save();

}
