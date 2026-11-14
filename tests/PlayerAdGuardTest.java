import com.yqxyy.english.PlayerAdGuard;

public class PlayerAdGuardTest {
    private static void check(boolean value, String what) {
        if (!value) throw new AssertionError(what);
    }
    public static void main(String[] args) {
        check(PlayerAdGuard.isKnownAdHost("cdn.doubleclick.net"), "known ads blocked");
        check(PlayerAdGuard.isKnownAdHost("adsterra.com"), "known ads blocked");
        check(PlayerAdGuard.isKnownAdHost("ads.clickadu.com"), "known popunder host blocked");
        check(!PlayerAdGuard.isKnownAdHost("cdn.vidlink.pro"), "TMDB playback iframe allowed");
        check(!PlayerAdGuard.isKnownAdHost("vidfast.vc"), "TMDB playback iframe allowed");
        check(!PlayerAdGuard.isKnownAdHost("my-doubleclick.net.example.org"), "exact suffix check");
        check(!PlayerAdGuard.isKnownAdHost("api.obj2.top"), "TMDB HLS allowed");
        check(!PlayerAdGuard.isKnownAdHost("cdn.fastcloud.live"), "video CDN allowed");
        check(!PlayerAdGuard.isKnownAdHost("api.tvmaze.com"), "metadata API allowed");
        check(!PlayerAdGuard.isKnownAdHost("player.vidmario.net"), "embed player allowed");
        check(PlayerAdGuard.isPlayerPage("https://yqxyy-r2.netlify.app/#/movie/tmdb-movie-387"), "movie route protected");
        check(PlayerAdGuard.isPlayerPage("https://yqxyy-r2.netlify.app/#/movie-hub/101"), "embedded hub protected");
        check(!PlayerAdGuard.isPlayerPage("https://yqxyy-r2.netlify.app/#/reading"), "reading links still allowed");
        check(PlayerAdGuard.canOpenExternalScheme("https"), "https links allowed off player");
        check(!PlayerAdGuard.canOpenExternalScheme("intent"), "no intent scheme");
        check(!PlayerAdGuard.canOpenExternalScheme("javascript"), "no javascript scheme");
        System.out.println("PASS: ad host filtering and player redirects, media CDN allowed");
    }
}
