<html>
  <body>
    <script>
      function jsonRequest(url) {
        $.ajax({ url: url, type: "post" });
      }

      function submitRequest(targetUrl) {
        jsonRequest(targetUrl);
      }

      var rootUrl = "/";
      var targetUrl = "/product/content/detail.as";
      submitRequest(rootUrl);
      submitRequest(targetUrl);
    </script>
  </body>
</html>
