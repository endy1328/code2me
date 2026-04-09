<html>
  <body>
    Sample List
    <a href="/sample/detail.as">Open Detail</a>
    <form action="/sample/save.as" method="post">
      <button type="submit">Save Sample</button>
    </form>
    <button type="button" onclick="location.href='/sample/detail.as'">Detail Button</button>
    <script>
      fetch('/sample/data.as');
    </script>
  </body>
</html>
