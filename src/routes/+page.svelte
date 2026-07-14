<script>
  import { invoke } from "@tauri-apps/api/core";
  import { saveToken, getToken, removeToken } from "$lib/storage";
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";


  let email = "";
  let password = "";

  let error = "";
  let loading = false;



  async function login(
    email,
    password,
    fingerprint
  ){

    const response = await fetch(
      "http://localhost:8000/auth/login",
      {
        method:"POST",

        headers:{
          "Content-Type":"application/json"
        },

        body:JSON.stringify({

          email,

          password,

          fingerprint

        })

      }
    );


    if(!response.ok){

      const text =
        await response.text();

      throw new Error(text);

    }


    return await response.json();

  }





  async function registerDevice(
    token,
    fingerprint
  ){

    const response = await fetch(
      "http://localhost:8000/devices/register",
      {

        method:"POST",

        headers:{

          "Content-Type":"application/json",

          "Authorization":
          `Bearer ${token}`

        },


        body:JSON.stringify({

          fingerprint,

          name:"My PC"

        })

      }
    );


    if(!response.ok){

      const text =
        await response.text();

      throw new Error(text);

    }


    return await response.json();

  }





  async function getMe(token){

    const response = await fetch(
      "http://localhost:8000/auth/me",
      {

        headers:{

          "Authorization":
          `Bearer ${token}`

        }

      }
    );


    if(!response.ok){

      throw new Error(
        "Token expired"
      );

    }


    return await response.json();

  }





  async function firstStart(){

    try{

      loading=true;

      error="";


      // получаем ID компьютера

      const fingerprint =
        await invoke(
          "device_fingerprint"
        );



      // логин

      const auth =
        await login(
          email,
          password,
          fingerprint
        );



      // сохраняем JWT

      await saveToken(
        auth.access_token
      );



      // регистрируем устройство

      await registerDevice(
        auth.access_token,
        fingerprint
      );



      // переходим в приложение

      await goto(
        "/courses"
      );


    }
    catch(e){

      console.error(e);

      error=e.message;

    }
    finally{

      loading=false;

    }

  }





  onMount(
    async()=>{


      const token =
        await getToken();



      if(!token){

        return;

      }



      try{


        await getMe(
          token
        );


        await goto(
          "/courses"
        );


      }
      catch(e){


        console.log(
          "Token invalid"
        );


        await removeToken();


      }


    }
  );


</script>



<main>


<h1>
Roadwits
</h1>


<input

placeholder="Email"

bind:value={email}

/>



<input

type="password"

placeholder="Password"

bind:value={password}

/>



<button

on:click={firstStart}

disabled={loading}

>

{loading ? "Loading..." : "Login"}

</button>



{#if error}

<p class="error">

{error}

</p>

{/if}



</main>



<style>

main{

display:flex;

flex-direction:column;

gap:15px;

width:300px;

margin:100px auto;

}


input{

padding:10px;

}


button{

padding:10px;

}


.error{

color:red;

}

</style>
