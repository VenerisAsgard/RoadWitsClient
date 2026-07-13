<script>
  import { invoke } from "@tauri-apps/api/core";

async function firstStart(){
  let fingerprint = await invoke("device_fingerprint")
  let token = await login(email, password)
  await registerDevice(token, fingerprint)
  openCourses()
}


</script>

<main class="container">
  this is we empty place
</main>

<style>

</style>
