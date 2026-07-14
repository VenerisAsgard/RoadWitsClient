<script>
  import { goto } from "$app/navigation";
  import { saveToken } from "$lib/storage";


  async function logout(){

    await saveToken(null);

    await goto("/");

  }

</script>


<main class="container">

<h1>
Roadwits Courses
</h1>


<p>
Welcome to your courses
</p>


<button on:click={logout}>
Logout
</button>


</main>


<style>

.container{

    display:flex;
    flex-direction:column;
    gap:20px;

    padding:40px;

}


button{

    width:150px;
    padding:10px;

    cursor:pointer;

}

</style>
